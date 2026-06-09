import AutoSsoSignIn from "./AutoSsoSignIn";

type PageProps = {
  searchParams?: Promise<{
    callbackUrl?: string | string[];
  }>;
};

function safeCallbackUrl(value: string | string[] | undefined) {
  const first = Array.isArray(value) ? value[0] : value;
  if (!first || !first.startsWith("/") || first.startsWith("//")) return "/";
  let raw: string = first;

  for (let i = 0; i < 3; i++) {
    const url = new URL(raw, "http://localhost");
    if (url.pathname !== "/auth/sso") break;

    const nested = url.searchParams.get("callbackUrl");
    if (!nested || !nested.startsWith("/") || nested.startsWith("//")) {
      return "/";
    }
    raw = nested;
  }

  return raw;
}

export default async function SsoPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  return (
    <>
      <style>{`.topbar, aside { display: none !important; }`}</style>
      <AutoSsoSignIn callbackUrl={safeCallbackUrl(params.callbackUrl)} />
    </>
  );
}
