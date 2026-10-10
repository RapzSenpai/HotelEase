import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import DemoSectionHeader from "./DemoSectionHeader";
import { useDemo } from "./DemoContext";

// View-only section body: columns are fixed, rows come from fixtures through
// the section's `rows(data)` selector. Writes are intentionally absent.
export default function DemoFixtureTable({ label, role, columns, rows }) {
  const { data } = useDemo();
  const tableRows = rows(data);

  return (
    <div className="space-y-4">
      <DemoSectionHeader
        label={label}
        role={role}
        description="Sample records from the demo fixtures — this section is view only."
      />
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column} className="whitespace-nowrap">{column}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {tableRows.map((row) => (
              <TableRow key={row.id}>
                {row.cells.map((cell, i) => (
                  <TableCell key={columns[i]} className="text-sm text-foreground/80">
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <p className="text-xs text-foreground/50">
        View only in the demo — real screens here add, edit, and resolve these records.
      </p>
    </div>
  );
}
