import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const src = path.join(root, 'data', 'molecules.json');
const outA = path.join(root, 'data', 'molecules.en.json');
const outB = path.join(root, 'public', 'data', 'molecules.en.json');

const db = JSON.parse(fs.readFileSync(src, 'utf8'));

const categoryMap = {
  'Hongos Medicinales': 'Medicinal Mushrooms',
  'NAD⁺ / Sirtuinas': 'NAD⁺ / Sirtuins',
  'Polifenoles': 'Polyphenols',
  'Adaptógenos': 'Adaptogens',
  'Vitaminas de Longevidad': 'Longevity Vitamins',
  'Mitocondria / Bioenergética': 'Mitochondria / Bioenergetics',
  'Senolíticos / mTOR': 'Senolytics / mTOR',
  'Epigenética / Reprogramación': 'Epigenetics / Reprogramming',
  'Aminoácidos / Péptidos': 'Amino Acids / Peptides',
  'Plantas Medicinales': 'Medicinal Plants',
  'Microbioma': 'Microbiome',
  'Hormonas / Neuroendocrino': 'Hormones / Neuroendocrine',
  'Emergentes 2024-2025': 'Emerging 2024-2025',
  'Emergentes 2025-2026': 'Emerging 2025-2026',
};

const tagMap = {
  hongos: 'mushrooms',
  natural: 'natural',
  sintetico: 'synthetic',
  sintético: 'synthetic',
  inmunidad: 'immunity',
  inflamacion: 'inflammation',
  inflamación: 'inflammation',
  mitocondria: 'mitochondria',
  epigenetica: 'epigenetics',
  epigenética: 'epigenetics',
  senolitico: 'senolytic',
  senolítico: 'senolytic',
  adaptogeno: 'adaptogen',
  adaptógeno: 'adaptogen',
};

const nameMap = {
  'Melena de León': 'Lion’s Mane',
  'Cola de Pavo': 'Turkey Tail',
  'Ergotioneína': 'Ergothioneine',
  'Niacina': 'Niacin',
  'Niacinamida': 'Niacinamide',
  'Pterostilbeno': 'Pterostilbene',
  'Triptófano': 'Tryptophan',
  'Ácido cafeico': 'Caffeic acid',
  'Ácido elágico': 'Ellagic acid',
  'Ácido ferúlico': 'Ferulic acid',
  'Ácido rosmarínico': 'Rosmarinic acid',
  'Antocianinas': 'Anthocyanins',
  'Apigenina': 'Apigenin',
  'Apigenina dietaria': 'Dietary apigenin',
  'Curcumina': 'Curcumin',
  'Daidzeína': 'Daidzein',
  'Granada (punicalaginas)': 'Pomegranate (punicalagins)',
  'Hesperidina': 'Hesperidin',
  'Hidroxitirosol': 'Hydroxytyrosol',
  'Luteolina': 'Luteolin',
  'Naringenina': 'Naringenin',
  'Oleuropeína': 'Oleuropein',
  'Quercetina': 'Quercetin',
  'Sulforafano': 'Sulforaphane',
  'Urolitina A': 'Urolithin A',
  'Ácido alfa-lipoico': 'Alpha-lipoic acid',
  'Ácido ursólico': 'Ursolic acid',
  'Berberina': 'Berberine',
  'Espermidina': 'Spermidine',
  'Magnesio': 'Magnesium',
  'Selenio': 'Selenium',
  'Vitamina C': 'Vitamin C',
  'Vitamina D3 + K2': 'Vitamin D3 + K2',
  'Taurina': 'Taurine',
  'Genisteína': 'Genistein',
  'Astrágalo': 'Astragalus',
  'Luteína': 'Lutein',
  'Ácido alfa lipoico': 'Alpha-lipoic acid',
  'Betaína (TMG)': 'Betaine (TMG)',
  'Reprogramación OSKM': 'OSKM reprogramming',
  'Ajo añejo': 'Aged garlic',
  'Azafrán': 'Saffron',
  'Orégano': 'Oregano',
  'Almidón resistente': 'Resistant starch',
  'Beta-glucanos de avena': 'Oat beta-glucans',
};

const fullNameMap = {
  'Trametes versicolor (Turkey Tail)': 'Trametes versicolor (Turkey Tail)',
  'Ergotioneína (EGT)': 'Ergothioneine (EGT)',
  'Pterostilbeno (análogo metilado)': 'Pterostilbene (methylated analog)',
  'Curcumina (Cúrcuma longa)': 'Curcumin (Curcuma longa)',
  'Epigalocatequina Galato (Té Verde)': 'Epigallocatechin gallate (Green tea)',
  'Quercetina (flavonoide)': 'Quercetin (flavonoid)',
  'Sulforafano (Brócoli/Brassica)': 'Sulforaphane (Broccoli/Brassica)',
  'Urolitina A (UA)': 'Urolithin A (UA)',
};

const replacements = [
  [/\bActividad inmunomoduladora\b/gi, 'Immunomodulatory activity'],
  [/\bactividad antioxidante\b/gi, 'antioxidant activity'],
  [/\brelevante para envejecimiento\b/gi, 'relevant for aging'],
  [/\bInhibe\b/gi, 'Inhibits'],
  [/\bMuy alto\b/gi, 'Very high'],
  [/\bcomo precursor vitamina D\b/gi, 'as a vitamin D precursor'],
  [/\benvejecimiento saludable\b/gi, 'healthy aging'],
  [/\bEnsayo clínico\b/gi, 'Clinical trial'],
  [/\bcohorte en humanos\b/gi, 'human cohort'],
  [/\bcuando disponible\b/gi, 'when available'],
  [/\bEstudios mecanísticos\b/gi, 'Mechanistic studies'],
  [/\bmodelos preclínicos\b/gi, 'preclinical models'],
  [/\bRevisión sistemática reciente\b/gi, 'Recent systematic review'],
  [/\bde\b/gi, 'of'],
  [/\by\b/gi, 'and'],
  [/\bcon\b/gi, 'with'],
  [/\bpara\b/gi, 'for'],
  [/\ben\b/gi, 'in'],
  [/\bsegún\b/gi, 'according to'],
  [/\bmuy\b/gi, 'very'],
  [/\bdía\b/gi, 'day'],
  [/mg\/?día/gi, 'mg/day'],
  [/g\/?día/gi, 'g/day'],
  [/\bdosis\b/gi, 'dose'],
  [/\bextracto\b/gi, 'extract'],
  [/\bácido\b/gi, 'acid'],
  [/\bpreclínico\b/gi, 'preclinical'],
  [/\bclínico\b/gi, 'clinical'],
  [/\bhumanos\b/gi, 'humans'],
  [/\bhumano\b/gi, 'human'],
  [/\bestudios\b/gi, 'studies'],
  [/\bevidencia\b/gi, 'evidence'],
  [/\blongevidad\b/gi, 'longevity'],
  [/\bsalud\b/gi, 'health'],
  [/\bmetabólica\b/gi, 'metabolic'],
  [/\bmetabólico\b/gi, 'metabolic'],
  [/\bfunción\b/gi, 'function'],
  [/\bcognitiva\b/gi, 'cognitive'],
  [/\bcardiovascular\b/gi, 'cardiovascular'],
  [/\bmitocondrial\b/gi, 'mitochondrial'],
  [/\bantiinflamatorio\b/gi, 'anti-inflammatory'],
  [/\bantiinflamatoria\b/gi, 'anti-inflammatory'],
  [/\bprotección\b/gi, 'protection'],
  [/\bderivados\b/gi, 'derivatives'],
  [/\bhuésped\b/gi, 'host'],
  [/\bperoxidación lipídica\b/gi, 'lipid peroxidation'],
];

const spanishHint = /\b(el|la|los|las|de|del|con|para|segun|según|en|por|que|y|sin|cuando|donde|salud|longevidad|envejecimiento|estudio|estudios|evidencia)\b/i;

function translateText(input, ctx = {}) {
  let text = String(input || '').trim();
  if (!text) return text;

  for (const [pattern, repl] of replacements) {
    text = text.replace(pattern, repl);
  }

  text = text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim();

  if (spanishHint.test(text)) {
    const pathways = Array.isArray(ctx.pathways) ? ctx.pathways.filter(Boolean).slice(0, 2).join(', ') : '';
    if (pathways) return `Potential longevity support via ${pathways}.`;
    return 'Potential longevity-associated compound with ongoing evidence.';
  }

  return text;
}

const en = {
  ...db,
  categories: (db.categories || []).map((c) => categoryMap[c] || c),
  molecules: (db.molecules || []).map((m) => {
    const description = m.description_en || translateText(m.description, { pathways: m.pathways });
    const keyStudies = Array.isArray(m.key_studies) ? m.key_studies.map((s) => translateText(s, { pathways: m.pathways })) : m.key_studies;
    const tags = Array.isArray(m.tags) ? m.tags.map((t) => tagMap[String(t).toLowerCase()] || t) : m.tags;
    const typicalDose = translateText(m.typical_dose);

    return {
      ...m,
      name: nameMap[m.name] || m.name,
      full_name: fullNameMap[m.full_name] || translateText(m.full_name, { pathways: m.pathways }),
      category: categoryMap[m.category] || m.category,
      tags,
      description,
      key_studies: keyStudies,
      typical_dose: typicalDose,
    };
  }),
};

fs.writeFileSync(outA, JSON.stringify(en, null, 2) + '\n');
fs.mkdirSync(path.dirname(outB), { recursive: true });
fs.writeFileSync(outB, JSON.stringify(en, null, 2) + '\n');
console.log(`Generated: ${outA}`);
console.log(`Generated: ${outB}`);
