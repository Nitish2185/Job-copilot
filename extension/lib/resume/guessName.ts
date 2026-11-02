/**
 * Guesses the person's name from the top of a resume, locally. The user confirms
 * it before anything is sent to the AI, so it can be removed from the text first.
 */
const NOT_A_NAME = /resume|curriculum|vitae|profile|summary|contact|@|\d|https?:|www\./i;
const NAME_WORD = /^\p{Lu}[\p{L}'.-]*$/u;

function titleCase(word: string): string {
  return word.charAt(0) + word.slice(1).toLowerCase();
}

export function guessFullName(text: string): string | undefined {
  const top = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .slice(0, 5);
  for (const line of top) {
    if (NOT_A_NAME.test(line)) continue;
    const words = line.split(/\s+/);
    if (words.length < 2 || words.length > 4 || !words.every((w) => NAME_WORD.test(w))) continue;
    return line === line.toUpperCase() ? words.map(titleCase).join(" ") : words.join(" ");
  }
  return undefined;
}
