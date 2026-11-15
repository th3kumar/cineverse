import type { AvailabilityProvider, MetadataProvider } from "../ports";
import type { MovieDetails, MovieId, MovieSummary, WatchOption } from "../types";

/** Small offline catalogue so the whole app runs with zero API keys. Data is illustrative. */
const MOVIES: MovieDetails[] = [
  { id: "mock:1", title: "Nosferatu", year: 1922, imdbId: "tt0013442", genres: ["Horror"], rating: 7.8, overview: "A vampire takes an interest in an estate agent and his wife.", trailers: [] },
  { id: "mock:2", title: "Metropolis", year: 1927, imdbId: "tt0017136", genres: ["Science Fiction"], rating: 8.1, overview: "In a futuristic city sharply divided between workers and planners…", trailers: [] },
  { id: "mock:3", title: "Night of the Living Dead", year: 1968, imdbId: "tt0063350", genres: ["Horror"], rating: 7.5, overview: "A group of people hide from flesh-eating ghouls in a farmhouse.", trailers: [] },
  { id: "mock:4", title: "Shutter Island", year: 2010, imdbId: "tt1130884", genres: ["Thriller", "Mystery"], rating: 8.2, overview: "A U.S. Marshal investigates a disappearance at a hospital for the criminally insane.", trailers: [{ site: "youtube", key: "MOCK_TRAILER_1" }] },
  { id: "mock:5", title: "Prisoners", year: 2013, imdbId: "tt1392214", genres: ["Thriller", "Crime"], rating: 8.1, overview: "A father takes matters into his own hands after his daughter goes missing.", trailers: [{ site: "youtube", key: "MOCK_TRAILER_2" }] },
  { id: "mock:6", title: "Gone Girl", year: 2014, imdbId: "tt2267998", genres: ["Thriller", "Drama"], rating: 8.1, overview: "A man becomes the focus of an investigation when his wife disappears.", trailers: [] },
  { id: "mock:7", title: "The Phantom Carriage", year: 1921, imdbId: "tt0012364", genres: ["Drama", "Horror"], rating: 8.0, overview: "A dying man is forced to drive Death's carriage.", trailers: [] },
];

const AVAILABILITY: Record<MovieId, Omit<WatchOption, "source">[]> = {
  "mock:4": [{ provider: "Prime Video", type: "subscription", url: "https://example.com/prime" }],
  "mock:5": [
    { provider: "Netflix", type: "subscription", url: "https://example.com/netflix" },
    { provider: "Apple TV", type: "rent", price: 120 },
  ],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const toSummary = ({ id, title, year, posterUrl, rating }: MovieDetails): MovieSummary => ({ id, title, year, posterUrl, rating });

export class MockMetadata implements MetadataProvider {
  readonly name = "mock";
  async search(title: string): Promise<MovieSummary | null> {
    const m = MOVIES.find((x) => norm(x.title) === norm(title));
    return m ? toSummary(m) : null;
  }
  async details(id: MovieId): Promise<MovieDetails> {
    const m = MOVIES.find((x) => x.id === id);
    if (!m) throw new Error(`Unknown movie ${id}`);
    return m;
  }
}

export class MockAvailability implements AvailabilityProvider {
  readonly name = "mock";
  async whereToWatch(movie: MovieDetails): Promise<WatchOption[]> {
    return (AVAILABILITY[movie.id] ?? []).map((o) => ({ ...o, deepLink: Boolean(o.url), source: this.name }));
  }
}
