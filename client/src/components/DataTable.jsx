/**
 * Responsive table. On wide screens it renders a normal table inside a horizontally
 * scrollable wrapper; below 720px each row is shown as a labelled card (see .data-table CSS).
 *
 * columns: [{ key, header, render?(row), className? }]
 */
export default function DataTable({ columns, rows, rowKey = (r) => r.id, caption, empty }) {
  if (!rows?.length) return empty || null;
  return (
    <div className="table-wrap">
      <table className="data-table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.className}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td key={c.key} data-label={c.header} className={c.className}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
