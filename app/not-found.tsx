import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export default function NotFound() {
  return (
    <>
      <PageHeader label="404 / Not found" title="Page not found" />
      <EmptyState
        action={
          <ButtonLink href="/" variant="primary">
            Back to home
          </ButtonLink>
        }
      >
        This page doesn&apos;t exist, or what it pointed to has been removed.
      </EmptyState>
    </>
  );
}
