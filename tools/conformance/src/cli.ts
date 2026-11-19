/** The XML suite's command line: scores the named libraries, each in a process of its own, and writes the reports. */
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { pin } from './fetch.ts';
import { type LibraryReport, writeReports } from './report.ts';
import { LIBRARIES, type LibraryScore, scoreLibrary } from './score.ts';

const SCORE = fileURLToPath(new URL('score.ts', import.meta.url));

/** Scores a library in a child process, so that no two libraries share globals. */
function scoreInChild(name: string): Promise<LibraryScore> {
  return new Promise((resolve, reject) => {
    const child = fork(SCORE, [name]);
    let score: LibraryScore | undefined;
    child.on('message', (message) => {
      score = message as LibraryScore;
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0 && score !== undefined) resolve(score);
      else reject(new Error(`Scoring ${name} exited with ${code}`));
    });
  });
}

/** Scores the named libraries and writes the reports; exemplar breaking its list fails the run. */
async function score(names: readonly string[]): Promise<void> {
  const reports: LibraryReport[] = [];
  for (const name of names) {
    // One library, as the Bun runs score exemplar, needs no process of its own.
    const { report, broken } = names.length === 1 ? await scoreLibrary(name) : await scoreInChild(name);
    reports.push(report);
    if (broken) process.exitCode = 1;
  }
  writeReports(reports);
}

const { positionals } = parseArgs({ allowPositionals: true });
if (positionals[0] === 'pin') {
  for (const name of positionals.slice(1)) console.log(name, JSON.stringify(await pin(name), undefined, 2));
} else {
  await score(positionals.length > 0 ? positionals : Object.keys(LIBRARIES));
}
