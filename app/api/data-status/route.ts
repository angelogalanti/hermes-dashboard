import { NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";
import fs from "fs";

export const dynamic = "force-dynamic";

// Prefer using the python binary from the auto-researchtrading virtual env since it has pandas and pyarrow
const VENV_PYTHON = "/home/x/repos/auto-researchtrading/main/.venv/bin/python";
const SCANNER_SCRIPT = path.join(process.cwd(), "scripts", "scan_data_status.py");

export async function GET(): Promise<Response> {
  return new Promise<Response>((resolve) => {
    // Determine which python interpreter to use
    const pythonBin = fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : "python3";
    const command = `"${pythonBin}" "${SCANNER_SCRIPT}"`;

    exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing scanner script: ${error.message}`);
        console.error(`stderr: ${stderr}`);
        return resolve(
          NextResponse.json(
            { error: `Failed to scan data cache: ${error.message}` },
            { status: 500 }
          )
        );
      }

      try {
        const data = JSON.parse(stdout);
        resolve(NextResponse.json(data));
      } catch (parseError: any) {
        console.error(`Failed to parse scanner output JSON: ${parseError.message}`);
        console.error(`Raw output: ${stdout}`);
        resolve(
          NextResponse.json(
            { error: `Malformed JSON from scanner script: ${parseError.message}` },
            { status: 500 }
          )
        );
      }
    });
  });
}
