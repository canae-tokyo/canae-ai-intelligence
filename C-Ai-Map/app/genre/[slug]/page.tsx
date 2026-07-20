import { notFound } from "next/navigation";
import Header from "@/components/Header";
import GenreView from "@/components/GenreView";
import {
  genres,
  getGenre,
  getToolsByGenre,
  getNewsByGenre,
  getCompaniesByGenre,
} from "@/lib/data";
import type { GenreId } from "@/lib/types";

export function generateStaticParams() {
  return genres.map((g) => ({ slug: g.id }));
}

export default function GenrePage({ params }: { params: { slug: string } }) {
  const genre = getGenre(params.slug);
  if (!genre) notFound();

  const id = params.slug as GenreId;
  const tools = getToolsByGenre(id);
  const news = getNewsByGenre(id);
  const companies = getCompaniesByGenre(id);

  return (
    <div>
      <Header title={genre.label} />
      <main className="px-4 py-6 md:px-8">
        <GenreView genre={genre} tools={tools} news={news} companies={companies} />
      </main>
    </div>
  );
}
