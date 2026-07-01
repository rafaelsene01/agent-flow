import BoardRoute from "./BoardRoute.jsx";

// Static export exige params estáticos. Os slugs de board são criados em runtime,
// então geramos só um placeholder ("_"): o Express serve esse shell para qualquer
// /board/<slug> e o BoardRoute resolve o board pelo pathname no cliente.
export function generateStaticParams() {
  return [{ slug: "_" }];
}

export default function BoardSlugPage() {
  return <BoardRoute />;
}
