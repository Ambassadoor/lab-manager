// Renders a chemical formula with its atom counts as subscripts, inline
// (e.g. "C2H5OH" -> C₂H₅OH). A number is only a subscript when it follows an
// element or a closing bracket; a leading number — like the 10 in a hydrate's
// "Na2SO4·10H2O" — is a coefficient and stays full-size.
export const ChemicalFormula = ({ formula }: { formula: string }) => (
  <span>
    {formula.split(/(\d+)/).map((part, i, parts) => {
      const isSubscript = /^\d+$/.test(part) && /[A-Za-z)\]]$/.test(parts[i - 1] ?? '');
      return isSubscript ? <sub key={i}>{part}</sub> : part;
    })}
  </span>
);
