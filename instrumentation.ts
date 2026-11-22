export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { gatePasswordProblem, readGateConfig } = await import("./lib/config");
  // A deployed environment without a usable password must not start.
  const problem = gatePasswordProblem(readGateConfig());
  if (problem) throw new Error(problem);
}
