import Head from "next/head";

export default function Home() {
  return (
    <>
      <Head>
        <title>Alii Fish Market</title>
        <meta name="description" content="Fresh fish and poke, Honolulu" />
      </Head>
      <main style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <h1>Alii Fish Market</h1>
        <p>
          Mirrored landing scaffold. Replace this with content mapped from
          aliifishmarket.com (hours, location, menu, catering, contact).
        </p>
        <section>
          <h2>Hours</h2>
          <p>Mon–Sun: 10am – 8pm (example)</p>
        </section>
        <section>
          <h2>Location</h2>
          <p>Honolulu, HI (example)</p>
        </section>
        <section>
          <h2>Contact</h2>
          <p>Email: info@aliifishmarket.com (placeholder)</p>
        </section>
      </main>
    </>
  );
}

