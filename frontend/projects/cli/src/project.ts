import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** A file of a project, as text: parsing is part of the checks. */
export interface ProjectFile {
  /** Path relative to the folder of the project, with forward slashes (`screens/order-list.json`). */
  file: string;
  text: string;
}

/** The folders of a project (ADR-14) and the files at its root. */
const FOLDERS = ['screens', 'datasources', 'themes', 'i18n'];
const ROOT_FILES = ['project.json', 'navigation.json'];

/** Reads the files of a project folder: the manifest, the navigation and the JSON files of its folders, in name order. */
export function readProject(folder: string): ProjectFile[] {
  const files: ProjectFile[] = [];
  for (const file of ROOT_FILES) {
    const path = join(folder, file);
    if (existsSync(path)) files.push({ file, text: readFileSync(path, 'utf8') });
  }
  for (const dir of FOLDERS) {
    const path = join(folder, dir);
    if (!existsSync(path)) continue;
    for (const name of readdirSync(path).filter((f) => f.endsWith('.json')).sort()) {
      files.push({ file: `${dir}/${name}`, text: readFileSync(join(path, name), 'utf8') });
    }
  }
  return files;
}
