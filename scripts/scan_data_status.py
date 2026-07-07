#!/usr/bin/env python3
import os
import sys
import json
import glob
from pathlib import Path
from datetime import datetime

# Aggiungiamo numpy e pandas in modalità lazy per velocizzare lo startup
# in caso non servano per i metadati veloci.
# Ma li importiamo all'inizio se possibile.
try:
    import numpy as np
    import pandas as pd
    import pyarrow.parquet as pq
    HAS_LIBS = True
except ImportError:
    HAS_LIBS = False

def format_val(val):
    if val is None:
        return "N/A"
    
    # Se abbiamo importato pandas/numpy, usiamo i loro controlli
    if HAS_LIBS:
        if pd.isna(val):
            return "N/A"
        if isinstance(val, (int, float, np.integer, np.floating)):
            dt = pd.to_datetime(val, unit="ms", utc=True)
            return dt.strftime("%Y-%m-%d")
        elif isinstance(val, (pd.Timestamp, datetime)):
            return val.strftime("%Y-%m-%d")
    
    # Fallback generico
    if isinstance(val, (int, float)):
        # Assumiamo timestamp in millisecondi se > 1e11 (es. 2019 in ms è ~1.5e12)
        if val > 100000000000:
            try:
                dt = datetime.fromtimestamp(val / 1000.0)
                return dt.strftime("%Y-%m-%d")
            except:
                pass
        try:
            dt = datetime.fromtimestamp(val)
            return dt.strftime("%Y-%m-%d")
        except:
            return str(val)
    elif isinstance(val, datetime):
        return val.strftime("%Y-%m-%d")
    elif isinstance(val, str):
        return val[:10]
    else:
        return str(val)[:10]

def get_parquet_info(path):
    size_bytes = path.stat().st_size
    row_count = 0
    start_date = "N/A"
    end_date = "N/A"
    
    if not HAS_LIBS:
        return row_count, start_date, end_date, size_bytes
        
    try:
        # 1. Tentativo veloce con pyarrow metadata (nessuna lettura dati)
        try:
            meta = pq.read_metadata(path)
            row_count = meta.num_rows
            col_names = meta.schema.names
            ts_col = "timestamp" if "timestamp" in col_names else ("ts" if "ts" in col_names else ("fundingTime" if "fundingTime" in col_names else None))
            
            if ts_col and meta.num_row_groups > 0:
                col_idx = col_names.index(ts_col)
                min_val = None
                max_val = None
                
                # Raccogli min/max tra tutti i row groups
                for rg_idx in range(meta.num_row_groups):
                    rg = meta.row_group(rg_idx)
                    col_meta = rg.column(col_idx)
                    stats = col_meta.statistics
                    if stats and stats.has_min_max:
                        rg_min = stats.min
                        rg_max = stats.max
                        if min_val is None or rg_min < min_val:
                            min_val = rg_min
                        if max_val is None or rg_max > max_val:
                            max_val = rg_max
                            
                if min_val is not None and max_val is not None:
                    start_date = format_val(min_val)
                    end_date = format_val(max_val)
                    return row_count, start_date, end_date, size_bytes
        except Exception:
            pass
            
        # 2. Fallback: leggi solo la colonna del timestamp con pandas
        # Troviamo prima quale colonna timestamp esiste
        df_schema = pd.read_parquet(path, engine="pyarrow") # molto piccolo se leggiamo solo colonne
        cols = df_schema.columns
        ts_col = "timestamp" if "timestamp" in cols else ("ts" if "ts" in cols else ("fundingTime" if "fundingTime" in cols else None))
        
        if ts_col:
            df = pd.read_parquet(path, columns=[ts_col])
            row_count = len(df)
            if row_count > 0:
                min_val = df[ts_col].min()
                max_val = df[ts_col].max()
                start_date = format_val(min_val)
                end_date = format_val(max_val)
    except Exception as e:
        # Se c'è un errore di lettura (es. file corrotto), restituiamo i valori di default
        pass
        
    return row_count, start_date, end_date, size_bytes

def scan_data():
    data_dir = Path.home() / ".cache/autotrader/data"
    if not data_dir.exists():
        return {"error": f"Data directory {data_dir} not found"}

    # Cerca tutti i file .parquet ricorsivamente
    parquet_files = glob.glob(str(data_dir / "**/*.parquet"), recursive=True)
    
    categories = {
        "crypto": {},
        "forex": {},
        "futures": {}
    }
    
    for file_path in parquet_files:
        path = Path(file_path)
        filename = path.name
        
        # Ignora file temporanei o backup
        if ".bak" in filename or "bak-" in filename or "prefunding" in filename or "tmp_" in file_path:
            continue
            
        # Determina categoria, asset symbol, timeframe e tipo
        # 1. Forex (in forex/)
        if "forex" in path.parts:
            category = "forex"
            name_parts = filename.replace(".parquet", "").split("_")
            symbol = name_parts[0].upper()
            timeframe = name_parts[1] if len(name_parts) > 1 else "1m"
            asset_type = "forex"
            
        # 2. Cripto (tutto il resto, inclusi i perpetuals con suffisso fut)
        else:
            category = "crypto"
            
            # Estrazione simbolo e timeframe per i file della basket (*fut_15m.parquet o *fut_1m.parquet)
            if filename.endswith("fut_15m.parquet"):
                symbol = filename.replace("fut_15m.parquet", "").upper()
                timeframe = "15m"
                asset_type = "perp"
            elif filename.endswith("fut_1m.parquet"):
                symbol = filename.replace("fut_1m.parquet", "").upper()
                timeframe = "1m"
                asset_type = "perp"
            elif filename.endswith("_funding8h.parquet"):
                symbol = filename.replace("_funding8h.parquet", "").upper()
                timeframe = "8h (funding)"
                asset_type = "perp"
            else:
                name_no_ext = filename.replace(".parquet", "")
                name_parts = name_no_ext.split("_")
                symbol = name_parts[0].upper()
                
                if len(name_parts) == 3 and name_parts[2] == "spot":
                    timeframe = name_parts[1]
                    asset_type = "spot"
                elif len(name_parts) == 2:
                    timeframe = name_parts[1]
                    asset_type = "perp"
                else:
                    timeframe = name_parts[1] if len(name_parts) > 1 else "unknown"
                    asset_type = "perp"
                    
        # Estrai metadati
        row_count, start_date, end_date, size_bytes = get_parquet_info(path)
        
        # Dividi cripto in asset separati spot e perp
        if category == "crypto":
            display_symbol = f"{symbol} (Spot)" if asset_type == "spot" else f"{symbol} (Perp)"
            group_key = f"{symbol}_{asset_type}"
        else:
            display_symbol = symbol
            group_key = symbol
            
        if group_key not in categories[category]:
            categories[category][group_key] = {
                "symbol": display_symbol,
                "category": category,
                "files": {} # Usiamo un dizionario per unificare per timeframe
            }
            
        # Se il timeframe esiste già per questo asset, effettua l'unione dei periodi e delle dimensioni
        if timeframe in categories[category][group_key]["files"]:
            existing = categories[category][group_key]["files"][timeframe]
            
            # Helper per calcolare l'unione delle date
            def parse_date(d):
                try:
                    return datetime.strptime(d, "%Y-%m-%d")
                except:
                    return None
            
            p1_start = parse_date(existing["startDate"])
            p1_end = parse_date(existing["endDate"])
            p2_start = parse_date(start_date)
            p2_end = parse_date(end_date)
            
            if p1_start and p2_start:
                existing["startDate"] = existing["startDate"] if p1_start < p2_start else start_date
            else:
                existing["startDate"] = existing["startDate"] if existing["startDate"] != "N/A" else start_date
                
            if p1_end and p2_end:
                existing["endDate"] = existing["endDate"] if p1_end > p2_end else end_date
            else:
                existing["endDate"] = existing["endDate"] if existing["endDate"] != "N/A" else end_date
                
            existing["rowCount"] += row_count
            existing["fileSize"] += size_bytes
        else:
            categories[category][group_key]["files"][timeframe] = {
                "timeframe": timeframe,
                "type": asset_type,
                "startDate": start_date,
                "endDate": end_date,
                "rowCount": row_count,
                "fileSize": size_bytes
            }

    # Converti in liste ordinate
    result = {}
    timeframe_order = {
        "1m": 1, "5m": 2, "15m": 3, "30m": 4, "1h": 5, "2h": 6, 
        "4h": 7, "6h": 8, "8h": 9, "8h (funding)": 10, "12h": 11, "1d": 12
    }
    
    for cat, assets in categories.items():
        asset_list = []
        for sym_key, data in assets.items():
            # Converti il dizionario dei file in una lista e ordinalo
            files_list = list(data["files"].values())
            files_list.sort(key=lambda x: timeframe_order.get(x["timeframe"], 99))
            data["files"] = files_list
            asset_list.append(data)
            
        # Ordina gli asset alfabeticamente per simbolo
        asset_list.sort(key=lambda x: x["symbol"])
        result[cat] = asset_list
        
    return result

if __name__ == "__main__":
    res = scan_data()
    print(json.dumps(res, separators=(",", ":")))
