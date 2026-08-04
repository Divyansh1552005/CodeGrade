/**
 * Mapping from our internal language names to Judge0 CE `language_id`s.
 *
 * Verified against Judge0 CE's GET /languages on this instance:
 *   63  JavaScript (Node.js 12.14.0)
 *   71  Python (3.8.1)
 *   62  Java (OpenJDK 13.0.1)
 *   54  C++ (GCC 9.2.0)
 *
 * IDs can differ between Judge0 versions — re-check GET /languages if you move
 * to a different instance.
 */
export const LANGUAGE_IDS = {
  javascript: 63,
  python: 71,
  java: 62,
  cpp: 54,
};

// The single source of truth for the allowlist used everywhere else.
export const SUPPORTED_LANGUAGES = Object.keys(LANGUAGE_IDS);

export function isSupportedLanguage(language) {
  return Object.prototype.hasOwnProperty.call(LANGUAGE_IDS, language);
}

export function languageId(language) {
  return LANGUAGE_IDS[language];
}
