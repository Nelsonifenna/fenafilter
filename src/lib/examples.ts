export const EXAMPLE_INSTRUCTIONS = [
  "Remove matches where both teams have a high scoring probability.",
  "Keep matches where the away team has failed to score frequently.",
  "Remove fixtures where the home team has poor recent form.",
  "Keep matches with a high probability of under 2.5 goals.",
  "Remove all matches where both teams have a high probability of scoring. Remove matches involving teams with poor attacking form. Keep matches where at least one team has a relatively low scoring probability.",
  "Remove matches involving defensively weak teams.",
] as const;
