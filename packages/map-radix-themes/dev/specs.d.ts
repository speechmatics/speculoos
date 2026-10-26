declare module "virtual:speculoos-specs" {
  import type { ApiIR } from "@speculoos/core";
  const specs: { name: string; title: string; ir: ApiIR }[];
  export default specs;
}
