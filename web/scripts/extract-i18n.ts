import { Project, SyntaxKind, Node } from 'ts-morph';
import fs from 'fs';
import path from 'path';

const project = new Project({
  tsConfigFilePath: 'tsconfig.json',
});

// Load existing locales
const enLocalesPath = path.resolve('./src/locales/en.json');
const zhLocalesPath = path.resolve('./src/locales/zh.json');

const enLocales = JSON.parse(fs.readFileSync(enLocalesPath, 'utf-8'));
const zhLocales = JSON.parse(fs.readFileSync(zhLocalesPath, 'utf-8'));

function saveLocales() {
  fs.writeFileSync(enLocalesPath, JSON.stringify(enLocales, null, 2));
  fs.writeFileSync(zhLocalesPath, JSON.stringify(zhLocales, null, 2));
}

// Generate a safe object path key
function generateKey(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/__+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 30);
}

// Simple key translation simulation (in real life you'd use a translation API)
// We just put English in both, or pseudo-translation.
function addToLocale(namespace, key, text) {
  if (!enLocales[namespace]) enLocales[namespace] = {};
  if (!zhLocales[namespace]) zhLocales[namespace] = {};
  
  if (!enLocales[namespace][key]) {
      enLocales[namespace][key] = text;
      // We don't automatically translate to Chinese, user will do that or we do it manually.
      // But we set the key so it's tracked.
      zhLocales[namespace][key] = text; 
  }
}

// Process files
const sourceFiles = project.getSourceFiles('src/views/**/*.tsx');
sourceFiles.push(...project.getSourceFiles('src/components/**/*.tsx'));

sourceFiles.forEach(sourceFile => {
  const baseName = sourceFile.getBaseNameWithoutExtension();
  let fileModified = false;
  let hasUseTranslation = false;

  // Track if we need to add import
  const importDecls = sourceFile.getImportDeclarations();
  const hasI18nImport = importDecls.some(imp => imp.getModuleSpecifierValue() === 'react-i18next');

  sourceFile.forEachDescendant(node => {
    if (Node.isJsxText(node)) {
      const text = node.getLiteralText();
      const trimmedText = text.trim();
      
      // Ignore empty or purely whitespace/brace elements
      if (trimmedText && trimmedText.length > 1 && !/^[{}]*$/.test(trimmedText)) {
        
        // Find nearest functional component to inject `const { t } = useTranslation();`
        const funcComp = node.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration) || 
                         node.getFirstAncestorByKind(SyntaxKind.ArrowFunction);
                         
        if (funcComp) {
            const block = funcComp.getBody();
            if (Node.isBlock(block)) {
                // Check if already injected
                if (!block.getText().includes('useTranslation()')) {
                   block.insertStatements(0, 'const { t } = useTranslation();');
                   fileModified = true;
                   hasUseTranslation = true;
                }
            }
        }

        const transKey = generateKey(trimmedText);
        const namespace = baseName.toLowerCase();
        
        addToLocale(namespace, transKey, trimmedText);
        
        // Replace node
        node.replaceWithText(`{t('${namespace}.${transKey}')}`);
        fileModified = true;
        hasUseTranslation = true;
      }
    }
  });

  if (fileModified) {
    if (!hasI18nImport && hasUseTranslation) {
      sourceFile.addImportDeclaration({
        namedImports: ['useTranslation'],
        moduleSpecifier: 'react-i18next'
      });
    }
    sourceFile.saveSync();
    console.log(`Processed: ${baseName}.tsx`);
  }
});

saveLocales();
console.log('Finished AST Extraction.');
