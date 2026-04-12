import React from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Admin, { getAdminMutationFeedback, updateUserRoleInList } from "@/pages/Admin";
import { useAuth } from "@/lib/auth";

const setAuthRole = (role: string | null) => {
  useAuth.setState({ role, userId: role ? 1 : null, user: role ? "Admin" : null });
};

test("Admin renders list for admin users", () => {
  setAuthRole("admin");
  const queryClient = new QueryClient();
  queryClient.setQueryData(["admin-users", false], [
    { id: 1, display_name: "Camille", role: "athlete", email: "camille@example.com", is_active: true },
  ]);

  const markup = renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Admin />
    </QueryClientProvider>,
  );

  assert.ok(markup.includes("Gestion des comptes"));
  assert.ok(markup.includes("Camille"));
});

test("Admin redirects non-admin users", () => {
  setAuthRole("coach");
  const queryClient = new QueryClient();

  const markup = renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <Admin />
    </QueryClientProvider>,
  );

  assert.ok(!markup.includes("Administration"));
});

test("updateUserRoleInList updates role in local list", () => {
  const users = [
    { id: 1, display_name: "Camille", role: "athlete" },
    { id: 2, display_name: "Coach", role: "coach" },
  ];

  const updated = updateUserRoleInList(users, 1, "comite");

  assert.equal(updated[0].role, "comite");
  assert.equal(updated[1].role, "coach");
});

test("getAdminMutationFeedback prevents false success when action is skipped", () => {
  const feedback = getAdminMutationFeedback("updateUserRole", "skipped");

  assert.equal(feedback.shouldInvalidate, false);
  assert.equal(feedback.shouldApplyOptimisticData, false);
  assert.equal(feedback.title, "Action non executee");
});

test("getAdminMutationFeedback keeps success semantics for real updates", () => {
  const feedback = getAdminMutationFeedback("disableUser", "disabled");

  assert.equal(feedback.shouldInvalidate, true);
  assert.equal(feedback.shouldApplyOptimisticData, false);
  assert.equal(feedback.title, "Compte desactive");
});
