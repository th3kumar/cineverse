// The onboarding pills and the TMDB ids behind them.

export interface Pill {
  id: string;
  label: string;
  kind: "lang" | "genre";
  /** TMDB original_language codes (lang) or genre ids (genre). Genre pills with 2 ids mean "both". */
  codes: string[] | number[];
}

export const LANGUAGES: Pill[] = [
  { id: "en", label: "English", kind: "lang", codes: ["en"] },
  { id: "hi", label: "Hindi", kind: "lang", codes: ["hi"] },
  { id: "ta", label: "Tamil", kind: "lang", codes: ["ta"] },
  { id: "te", label: "Telugu", kind: "lang", codes: ["te"] },
  { id: "ml", label: "Malayalam", kind: "lang", codes: ["ml"] },
  { id: "kn", label: "Kannada", kind: "lang", codes: ["kn"] },
  { id: "ko", label: "Korean", kind: "lang", codes: ["ko"] },
];

export const GENRES: Pill[] = [
  { id: "thriller", label: "Thriller", kind: "genre", codes: [53] },
  { id: "horror", label: "Horror", kind: "genre", codes: [27] },
  { id: "action", label: "Action", kind: "genre", codes: [28] },
  { id: "adventure", label: "Adventure", kind: "genre", codes: [12] },
  { id: "romcom", label: "Rom-com", kind: "genre", codes: [10749, 35] },
  { id: "horrorcom", label: "Horror-comedy", kind: "genre", codes: [27, 35] },
  { id: "scifi", label: "Sci-fi", kind: "genre", codes: [878] },
  { id: "drama", label: "Drama", kind: "genre", codes: [18] },
  { id: "comedy", label: "Comedy", kind: "genre", codes: [35] },
];

export const GENRE_NAMES: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime", 99: "Documentary",
  18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
  9648: "Mystery", 10749: "Romance", 878: "Sci-fi", 10770: "TV Movie", 53: "Thriller",
  10752: "War", 37: "Western",
};

export const LANG_NAMES: Record<string, string> = {
  en: "English", hi: "Hindi", ta: "Tamil", te: "Telugu", ml: "Malayalam", kn: "Kannada",
  ko: "Korean", ja: "Japanese", fr: "French", es: "Spanish", de: "German", it: "Italian",
  zh: "Chinese", sv: "Swedish", bn: "Bengali", mr: "Marathi", pa: "Punjabi",
};

/** Moods offered as one-tap shortcuts, with the offline fallback filters used if the AI is unavailable. */
export const MOODS: { label: string; text: string; include: number[]; exclude: number[] }[] = [
  { label: "Something cozy", text: "something cozy and warm", include: [35, 10749, 10751], exclude: [27, 53] },
  { label: "Mind-bending", text: "a mind-bending film with a twist", include: [878, 9648, 53], exclude: [10751] },
  { label: "Make me laugh", text: "make me laugh", include: [35], exclude: [27, 18] },
  { label: "Edge of my seat", text: "tense and thrilling", include: [53, 28, 80], exclude: [10751] },
];

/**
 * Public-domain films on the Internet Archive (feature_films collection). Each identifier was
 * found in the Archive's search; check rights for your region before adding more.
 */
export const FREE_FILMS: { title: string; year: number; archiveId: string }[] = [
  { title: "Nosferatu", year: 1922, archiveId: "Nosferatu_most_complete_version_93_mins." },
  { title: "The General", year: 1926, archiveId: "The_General_Buster_Keaton" },
  { title: "The Cabinet of Dr. Caligari", year: 1920, archiveId: "DasKabinettdesDoktorCaligariTheCabinetofDrCaligari" },
  { title: "The Phantom of the Opera", year: 1925, archiveId: "ThePhantomOfTheOpera1925NewYorkGeneralReleasePrint_620" },
];
