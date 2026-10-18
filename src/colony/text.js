// Korean particles that depend on the last syllable: josa('저장소', '을', '를') → '저장소를'
export function josa(word, withFinal, withoutFinal) {
  const c = String(word).charCodeAt(String(word).length - 1)
  const hasFinal = c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 !== 0 : false
  return word + (hasFinal ? withFinal : withoutFinal)
}
