// Build exact exercise motions from the non-commercial workout-motion artwork.
// Source is pinned by the GitHub workflow; generated GIFs are only for EAC use.
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const sourceDir = process.argv[2];
const outputDir = process.argv[3];
if (!sourceDir || !outputDir) throw new Error('Usage: node export_manon_motion_frames.mjs sourceDir outputDir');
const { renderSvg, getExercise } = await import(pathToFileURL(path.join(sourceDir, 'dist/h2.js')).href);

const exercises = [
  { key: 'assisted-pull-up', name: 'tractions-assistees', title: 'Tractions assistées', frames: 22 },
  { key: 'hang-clean', name: 'hang-power-clean', title: 'Hang Power Clean', frames: 24 },
  { key: 'forearm-plank', name: 'gainage-frontal', title: 'Gainage frontal', frames: 1 },
  { key: 'pull-up', name: 'tractions-strictes', title: 'Tractions strictes', frames: 22 },
  { key: 'incline-push-up', name: 'pompes-sur-appui', title: 'Pompes sur appui', frames: 22 },
];
for (const exercise of exercises) {
  if (!getExercise(exercise.key)) throw new Error('Missing workout-motion exercise: ' + exercise.key);
  const folder = path.join(outputDir, exercise.name);
  mkdirSync(folder, { recursive: true });
  for (let i = 0; i < exercise.frames; i++) {
    const phase = exercise.frames === 1 ? 0.2 : i / exercise.frames;
    const svg = renderSvg(exercise.key, { size: 400, phase, title: exercise.title });
    writeFileSync(path.join(folder, String(i).padStart(3, '0') + '.svg'), svg, 'utf8');
  }
  console.log(exercise.name, exercise.frames, 'frames');
}
