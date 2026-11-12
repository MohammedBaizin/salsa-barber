import { notFound } from "next/navigation";

/** Unknown dashboard addresses show the dashboard's own "not found" screen inside the shell. */
export default function Missing(): never {
  notFound();
}
