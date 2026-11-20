// Original vector artwork using the approved semantic palette. No remote assets.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { root } from './release-lib.mjs';
import path from 'node:path';

const assets = path.join(root, 'assets'), source = path.join(assets, 'source');
await mkdir(source, { recursive: true });
const css = await readFile(path.join(root, 'panel/styles.css'), 'utf8');
const token = name => {
  const value = css.match(new RegExp('--color-' + name + ':\\s*(#[a-f0-9]{6})', 'i'))?.[1];
  if (!value) throw new Error('Missing approved fallback token: ' + name);
  return value;
};
const ink = token('foreground'), green = token('primary'), white = token('surface'), muted = token('secondary');
const svg = (width,height,body) => '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '"><defs><clipPath id="tile"><rect x="8" y="8" width="496" height="496" rx="124"/></clipPath></defs>' + body + '</svg>';
const emblem = '<rect x="8" y="8" width="496" height="496" rx="124" fill="' + ink + '"/>' +
  '<circle cx="454" cy="48" r="264" fill="' + white + '" opacity=".055" clip-path="url(#tile)"/>' +
  '<rect x="108" y="130" width="260" height="186" rx="28" fill="none" stroke="' + white + '" stroke-width="16"/>' +
  '<path d="m154 190 34 30-34 30m68 0h35" fill="none" stroke="' + white + '" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<path d="m377 356 54 54" stroke="' + white + '" stroke-width="25" stroke-linecap="round"/>' +
  '<circle cx="331" cy="310" r="73" fill="' + white + '"/>' +
  '<circle cx="331" cy="310" r="54" fill="none" stroke="' + green + '" stroke-width="14"/>' +
  '<circle cx="331" cy="310" r="9" fill="' + green + '"/>';
const icon = svg(512,512,emblem);
const glyph = (x,y,size) => '<g transform="translate(' + x + ' ' + y + ') scale(' + size/512 + ')">' + emblem + '</g>';
const label = (x,y,text,size,color,weight=400) => '<text x="' + x + '" y="' + y + '" fill="' + color + '" font-family="Arial, sans-serif" font-size="' + size + '" font-weight="' + weight + '">' + text + '</text>';
// The capture uses a uniform dark backdrop; brighten its details only in the cover image.
const shot = await sharp(path.join(source, 'panel-demo-dark.png')).modulate({ brightness:1.12 }).png({ compressionLevel:9 }).toBuffer();
// Derive shades and highlights from the same approved semantic palette.
const channels = hex => [1,3,5].map(start => parseInt(hex.slice(start,start+2),16));
const hex = rgb => '#' + rgb.map(n => Math.round(n).toString(16).padStart(2,'0')).join('');
const mix = (a,b,amount) => hex(channels(a).map((n,i) => n*(1-amount)+channels(b)[i]*amount));
const shade = (color,amount) => hex(channels(color).map(n => n*amount));
const night = shade(mix(ink,green,.2),.2), deep = shade(ink,.28);
const lavender = mix(ink,white,.56), mint = mix(green,white,.5), quiet = mix(muted,white,.3);
const cover = svg(1600,1000,
  '<defs><linearGradient id="night" x1="0" y1="0" x2="1" y2="1"><stop stop-color="' + night + '"/><stop offset="1" stop-color="' + deep + '"/></linearGradient>' +
  '<radialGradient id="violet"><stop stop-color="' + lavender + '" stop-opacity=".24"/><stop offset="1" stop-color="' + ink + '" stop-opacity="0"/></radialGradient>' +
  '<radialGradient id="mint"><stop stop-color="' + mint + '" stop-opacity=".13"/><stop offset="1" stop-color="' + green + '" stop-opacity="0"/></radialGradient>' +
  '<filter id="shadow" x="-40%" y="-15%" width="180%" height="150%"><feDropShadow dx="0" dy="0" stdDeviation="32" flood-color="' + lavender + '" flood-opacity=".7"/><feDropShadow dx="0" dy="0" stdDeviation="12" flood-color="' + mint + '" flood-opacity=".3"/></filter>' +
  '<clipPath id="panel"><rect x="950" y="32" width="432" height="936" rx="24"/></clipPath></defs>' +
  '<rect width="1600" height="1000" fill="url(#night)"/><ellipse cx="1190" cy="330" rx="640" ry="560" fill="url(#violet)"/><ellipse cx="1450" cy="820" rx="510" ry="440" fill="url(#mint)"/>' +
  '<g fill="none" stroke="' + lavender + '"><circle cx="1240" cy="500" r="480" opacity=".065"/><circle cx="1240" cy="500" r="570" opacity=".04"/><path d="M710 920C850 820 864 630 930 500S1020 260 1550 140" opacity=".09"/></g>' +
  glyph(80,90,76) + label(178,141,'Terminal Lens',32,white,700) +
  label(76,322,'See All Active',72,white,700) +
  label(76,412,'Terminals in',72,white,700) + label(76,502,'One Place!',72,mint,700) +
  label(84,594,'Find a process. Jump to its terminal.',32,white) +
  label(84,667,'See what’s running in your terminals',28,quiet) +
  label(84,709,'across projects and worktrees.',28,quiet) +
  '<rect x="84" y="748" width="448" height="58" rx="14" fill="' + lavender + '" fill-opacity=".07" stroke="' + lavender + '" stroke-opacity=".22"/>' +
  '<g fill="none" stroke="' + mint + '" stroke-width="2" stroke-linecap="round"><circle cx="114" cy="774" r="7"/><path d="m119 779 6 6"/></g>' +
  label(140,785,'Search by process or terminal name',21,white,500) +
  '<rect x="948" y="30" width="436" height="940" rx="26" fill="' + lavender + '" fill-opacity=".48" filter="url(#shadow)"/>' +
  '<image x="950" y="32" width="432" height="936" preserveAspectRatio="xMidYMid meet" clip-path="url(#panel)" xlink:href="data:image/png;base64,' + shot.toString('base64') + '"/>' +
  label(1118,990,'Sample data',13,quiet));
const social = svg(1280,640,
  '<defs><linearGradient id="night" x1="0" y1="0" x2="1" y2="1"><stop stop-color="' + night + '"/><stop offset="1" stop-color="' + deep + '"/></linearGradient><radialGradient id="halo"><stop stop-color="' + lavender + '" stop-opacity=".22"/><stop offset="1" stop-color="' + ink + '" stop-opacity="0"/></radialGradient></defs>' +
  '<rect width="1280" height="640" fill="url(#night)"/><circle cx="1040" cy="320" r="470" fill="url(#halo)"/><circle cx="1040" cy="320" r="263" fill="none" stroke="' + lavender + '" stroke-opacity=".1"/><circle cx="1040" cy="320" r="340" fill="none" stroke="' + mint + '" stroke-opacity=".06"/>' +
  glyph(68,68,80) + label(168,120,'COMMUNITY PLUGIN FOR ORCA',17,quiet,700) +
  label(68,314,'Terminal Lens',86,white,700) + label(74,386,'Find a process.',37,mint,700) +
  label(74,440,'Jump to its terminal.',37,white) +
  glyph(876,146,346) + label(74,580,'Search running commands across projects and worktrees.',20,quiet));
for (const [name,art] of [['icon',icon],['cover',cover],['social',social]]) {
  await writeFile(path.join(source,name + '.svg'),art + '\n');
  await sharp(Buffer.from(art)).png({compressionLevel:9}).toFile(path.join(assets,name + '.png'));
}
console.log('Generated icon (512x512), cover (1600x1000), and social preview (1280x640).');
