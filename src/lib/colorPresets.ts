import { PresetColor } from '../types';

const presetNames = [
  // Row 1: Female Leads & Young Roles
  '女一', '女二', '女三', '女四', '青年女一', '青年女二', '青年男一', '青年男二',
  // Row 2: Mid-age Roles & Misc
  '中年女一', '中年女二', '中年女三', '中年男一', '中年男二', '中年男三', '老年女', '老年男',
  // Row 3: Teen/Child Roles & Misc
  '少女', '少年', '女童', '男童', '旁白一', '旁白二', '旁白三', '旁白四',
  // Row 4: Supporting Roles & Misc
  '龙套女一', '龙套女二', '龙套男一', '龙套男二', '[音效]', 'OS', '系统', 'AI',
];

// Palette for CV Presets
const cvColorPalette: Omit<PresetColor, 'name'>[] = [
  // Row 1: Medium, saturated (black text)
  { bgColorClass: '#FF4D4D', textColorClass: '#000000' }, // Red
  { bgColorClass: '#FF922B', textColorClass: '#000000' }, // Orange
  { bgColorClass: '#FFD43B', textColorClass: '#000000' }, // Yellow
  { bgColorClass: '#51CF66', textColorClass: '#000000' }, // Green
  { bgColorClass: '#22B8CF', textColorClass: '#000000' }, // Cyan
  { bgColorClass: '#4DABF7', textColorClass: '#000000' }, // Blue
  { bgColorClass: '#748FFC', textColorClass: '#000000' }, // Indigo
  { bgColorClass: '#B197FC', textColorClass: '#000000' }, // Purple

  // Row 2: Dark (rotated order; white text)
  { bgColorClass: '#2F9E44', textColorClass: '#FFFFFF' }, // Green (dark)
  { bgColorClass: '#0B7285', textColorClass: '#FFFFFF' }, // Cyan (dark)
  { bgColorClass: '#1971C2', textColorClass: '#FFFFFF' }, // Blue (dark)
  { bgColorClass: '#364FC7', textColorClass: '#FFFFFF' }, // Indigo (dark)
  { bgColorClass: '#5F3DC4', textColorClass: '#FFFFFF' }, // Purple (dark)
  { bgColorClass: '#B00020', textColorClass: '#FFFFFF' }, // Red (dark)
  { bgColorClass: '#9A3412', textColorClass: '#FFFFFF' }, // Orange (dark)
  { bgColorClass: '#8A6A00', textColorClass: '#FFFFFF' }, // Yellow (dark)

  // Row 3: Pastels (rotated order; black text)
  { bgColorClass: '#D0EBFF', textColorClass: '#000000' }, // Blue (light)
  { bgColorClass: '#EDF2FF', textColorClass: '#000000' }, // Indigo (light)
  { bgColorClass: '#F3D9FA', textColorClass: '#000000' }, // Purple (light)
  { bgColorClass: '#FFD6D6', textColorClass: '#000000' }, // Red (light)
  { bgColorClass: '#FFE8CC', textColorClass: '#000000' }, // Orange (light)
  { bgColorClass: '#FFF3BF', textColorClass: '#000000' }, // Yellow (light)
  { bgColorClass: '#D3F9D8', textColorClass: '#000000' }, // Green (light)
  { bgColorClass: '#C5F6FA', textColorClass: '#000000' }, // Cyan (light)

  // Row 4: Deep (rotated order; white text)
  { bgColorClass: '#2B0A3D', textColorClass: '#FFFFFF' }, // Purple (deep)
  { bgColorClass: '#4B0000', textColorClass: '#FFFFFF' }, // Red (deep)
  { bgColorClass: '#431407', textColorClass: '#FFFFFF' }, // Orange (deep)
  { bgColorClass: '#332700', textColorClass: '#FFFFFF' }, // Yellow (deep)
  { bgColorClass: '#0B3D20', textColorClass: '#FFFFFF' }, // Green (deep)
  { bgColorClass: '#00343D', textColorClass: '#FFFFFF' }, // Cyan (deep)
  { bgColorClass: '#002766', textColorClass: '#FFFFFF' }, // Blue (deep)
  { bgColorClass: '#1B1E5A', textColorClass: '#FFFFFF' }, // Indigo (deep)
];

// Palette for Character Presets - distinct variations from the CV palette
const characterColorPalette: Omit<PresetColor, 'name'>[] = [
  // Row 1: Bright colors with black text, variations from CV palette
  { bgColorClass: 'bg-rose-400', textColorClass: 'text-black' },    // from red-400
  { bgColorClass: 'bg-orange-300', textColorClass: 'text-black' },   // from orange-400
  { bgColorClass: 'bg-yellow-200', textColorClass: 'text-black' },   // from yellow-300
  { bgColorClass: 'bg-green-400', textColorClass: 'text-black' },     // from lime-400
  { bgColorClass: 'bg-teal-400', textColorClass: 'text-black' },      // from cyan-400
  { bgColorClass: 'bg-blue-400', textColorClass: 'text-black' },       // from sky-400
  { bgColorClass: 'bg-purple-400', textColorClass: 'text-black' },   // from violet-400
  { bgColorClass: 'bg-fuchsia-400', textColorClass: 'text-black' }, // from pink-400

  // Row 2: Darker colors with white text, variations from CV palette
  { bgColorClass: 'bg-red-800', textColorClass: 'text-white' },       // from red-700
  { bgColorClass: 'bg-amber-800', textColorClass: 'text-white' },    // from orange-700
  { bgColorClass: 'bg-yellow-800', textColorClass: 'text-white' },   // from yellow-700
  { bgColorClass: 'bg-lime-800', textColorClass: 'text-white' },     // from lime-700
  { bgColorClass: 'bg-cyan-800', textColorClass: 'text-white' },      // from cyan-700
  { bgColorClass: 'bg-blue-800', textColorClass: 'text-white' },       // from blue-700
  { bgColorClass: 'bg-violet-800', textColorClass: 'text-white' },   // from violet-700
  { bgColorClass: 'bg-rose-800', textColorClass: 'text-white' },     // from pink-700
];


// 4x8 grid = 32 colors for CV Presets.
export const defaultCvPresetColors: PresetColor[] = cvColorPalette.map((preset, index) => ({
  ...preset,
  name: presetNames[index] || `Preset ${index + 1}`,
}));

// 2x8 grid = 16 colors for Character Presets, using the distinct character palette.
export const defaultCharacterPresetColors: PresetColor[] = characterColorPalette.map((preset, index) => ({
  ...preset,
  name: presetNames[index] || `Preset ${index + 1}`, // Names can be the same, just colors differ
}));
