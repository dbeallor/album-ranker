import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>Album ranker</h1>
      <p>
        <Link href="/search">Search albums</Link>
      </p>
    </main>
  );
}
