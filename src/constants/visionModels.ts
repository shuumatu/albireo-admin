export const visionModelOptions = [
  { label: 'GLM-4.6V-Flash（免费版）', value: 'zhipu' },
  { label: 'GLM-4.6V-FlashX', value: 'zhipu-flashx' },
  { label: 'Gemini 3.8 Flash', value: 'gemini' },
  { label: 'Pegasus 1.5', value: 'twelvelabs' },
]

export const visionModelLabels: Record<string, string> = Object.fromEntries(
  visionModelOptions.map(({ label, value }) => [value, label]),
)
