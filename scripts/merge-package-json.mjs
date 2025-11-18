#!/usr/bin/env node

import { execSync } from 'node:child_process';
import fs from 'node:fs';

const filepath = process.argv[2];

if (!filepath) {
  console.error('[merge-package-json] Missing file path argument.');
  process.exit(1);
}

const readStage = (stage) => {
  try {
    const output = execSync(`git show :${stage}:${filepath}`, { encoding: 'utf8' });
    return JSON.parse(output);
  } catch (error) {
    console.error(`[merge-package-json] Unable to read stage ${stage} for ${filepath}.`);
    throw error;
  }
};

const sortObjectKeys = (input) => {
  if (!input) {
    return undefined;
  }

  return Object.keys(input)
    .sort()
    .reduce((acc, key) => {
      acc[key] = input[key];
      return acc;
    }, {});
};

const mergeDependencyBlock = (prBlock, baseBlock) => {
  if (!prBlock && !baseBlock) {
    return undefined;
  }

  const result = { ...(prBlock || {}) };

  if (baseBlock) {
    for (const [name, version] of Object.entries(baseBlock)) {
      result[name] = version;
    }
  }

  const sorted = sortObjectKeys(result);
  return sorted && Object.keys(sorted).length > 0 ? sorted : undefined;
};

const prPackage = readStage(2);
const basePackage = readStage(3);

if (!prPackage || !basePackage) {
  console.error('[merge-package-json] Required merge stages are missing.');
  process.exit(1);
}

const mergedPackage = structuredClone(prPackage);

if (basePackage.version) {
  mergedPackage.version = basePackage.version;
}

const dependencyFields = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
  'bundledDependencies',
  'bundleDependencies',
];

for (const field of dependencyFields) {
  const mergedBlock = mergeDependencyBlock(prPackage[field], basePackage[field]);
  if (mergedBlock) {
    mergedPackage[field] = mergedBlock;
  } else {
    delete mergedPackage[field];
  }
}

fs.writeFileSync(filepath, `${JSON.stringify(mergedPackage, null, 2)}\n`, 'utf8');
console.log(`[merge-package-json] Resolved ${filepath}`);

