import React from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SwimCatalog from "@/pages/coach/SwimCatalog";


test("SwimCatalog renders coach list header", () => {
  // §219: API façade removed — SSR test relies only on loading state markup
  // (the query never resolves during renderToStaticMarkup, so getSwimCatalog
  // is never invoked). Previous monkey-patching of `api.getSwimCatalog` is
  // therefore unnecessary.
  const queryClient = new QueryClient();
  const markup = renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <SwimCatalog />
    </QueryClientProvider>,
  );

  // Loading state renders skeleton placeholders (query hasn't resolved in SSR)
  assert.ok(markup.includes("animate-pulse"));
  assert.ok(markup.includes("border-b"));
});
