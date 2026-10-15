import type {Wine} from './domain.ts';
export type LabelFields=Partial<Omit<Wine,'id'|'image_url'|'tasting_notes'>>;
// Only explicit label prefixes and unambiguous numbers are assigned. A varietal
// word alone never becomes a guessed wine name, producer, country or wine type.
export function extractLabel(text:string,confidence:number):LabelFields{
 if(confidence<55||!text.trim())return {};
 const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);const result:LabelFields={};
 const field=(expression:RegExp)=>{const matches=lines.map(l=>l.match(expression)?.[1]?.trim()).filter((s):s is string=>Boolean(s));return matches.length===1?matches[0]:undefined;};
 const name=field(/^(?:Wine(?: name)?|Cuv[eé]e)\s*:\s*(.{2,200})$/i);if(name)result.name=name;
 const producer=field(/^(?:Producer|Winery|Vintner|Estate)\s*:\s*(.{2,200})$/i);if(producer)result.producer=producer;
 const type=field(/^(?:Wine type|Type|Style)\s*:\s*(.{2,160})$/i);if(type)result.wine_type=type;
 const country=field(/^(?:Country\s*:\s*|Product of\s+)([A-Za-zÀ-ÿ .'-]{2,160})$/i);if(country)result.country=country;
 const region=field(/^(?:Region|Appellation)\s*:\s*(.{2,160})$/i);if(region)result.region=region;
 const grape=field(/^(?:Grape(?:s| variety)?|Varietal)\s*:\s*(.{2,200})$/i);if(grape)result.grape_variety=grape;
 if(!grape&&confidence>=80){const varieties=['Cabernet Sauvignon','Merlot','Pinot Noir','Syrah','Grenache','Tempranillo','Sangiovese','Nebbiolo','Malbec','Chardonnay','Sauvignon Blanc','Riesling','Pinot Grigio','Chenin Blanc'];const found=varieties.filter(g=>lines.some(line=>line.replace(/^100%\s*/,'').toLowerCase()===g.toLowerCase()));if(found.length===1)result.grape_variety=found[0];}
 const vintages=Array.from(new Set(Array.from(text.matchAll(/\b(18\d{2}|19\d{2}|20\d{2})\b/g),m=>+m[1]).filter(y=>y<=new Date().getFullYear()+1)));
 if(vintages.length===1&&lines.some(line=>new RegExp(`^(?:(?:Vintage|Year)\\s*:?\\s*)?${vintages[0]}$`,'i').test(line)))result.vintage=vintages[0];
 const sizes=Array.from(new Set(Array.from(text.matchAll(/\b(\d{2,5})\s*(ml|cl)\b/gi),m=>+m[1]*(m[2].toLowerCase()==='cl'?10:1)).filter(n=>n>=50&&n<=18000)));
 if(sizes.length===1)result.bottle_size=sizes[0];
 return result;
}
