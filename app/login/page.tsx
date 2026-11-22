import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { InlineForm } from "@/components/ui/inline-form";
import { Message } from "@/components/ui/message";
import { PageHeader } from "@/components/ui/page-header";
import { Stack } from "@/components/ui/stack";
import { TextField } from "@/components/ui/text-field";
import { safeNext } from "@/lib/auth/redirect-target";
import { readGateConfig } from "@/lib/config";
import { loginAction } from "./actions";

export const metadata: Metadata = { title: "Log in | Album ranker" };

type Param = string | string[] | undefined;

const MESSAGES: Record<string, string> = {
  wrong: "Wrong password.",
  locked: "Too many tries. Wait 15 minutes.",
};

function first(param: Param): string {
  return (Array.isArray(param) ? param[0] : param) ?? "";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: Param; error?: Param }> }) {
  const params = await searchParams;
  const next = safeNext(first(params.next));
  if (readGateConfig().appPassword === null) redirect(next); // no gate here, so nothing to log in to
  const message = MESSAGES[first(params.error)];

  return (
    <>
      <PageHeader label="Private" title="Log in" />
      <Stack gap={5}>
        {message && (
          <Message tone="error" role="alert">
            {message}
          </Message>
        )}
        <InlineForm action={loginAction}>
          <TextField label="Password" type="password" name="password" autoComplete="current-password" required />
          <Button type="submit" variant="primary">
            Log in
          </Button>
          <input type="hidden" name="next" value={next} />
        </InlineForm>
      </Stack>
    </>
  );
}
