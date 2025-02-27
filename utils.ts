export function bail(error: string) {
  console.error(error);
  Deno.exit(1);
}
