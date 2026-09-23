import { CardContent, Stack } from '@mui/material';
import Decimal from 'decimal.js';
import type { Chemical } from '../../../types';
import { ChemicalFormula } from '../../shared/ChemicalFormula';
import { DetailRow } from '../../shared/DetailRow';

// Read-only body of ChemicalDetail's card
export const ChemicalView = ({ chemical }: { chemical: Chemical }) => (
  <CardContent>
    <Stack spacing={1.5}>
      <DetailRow label="CAS #">{chemical.cas}</DetailRow>
      <DetailRow label="Molecular Weight">
        {/* Decimal drops the API's trailing zeros ("58.4400" -> "58.44") */}
        {chemical.molecular_weight
          ? `${new Decimal(chemical.molecular_weight).toString()} g/mol`
          : 'Not set'}
      </DetailRow>
      <DetailRow label="Formula">
        {chemical.formula ? <ChemicalFormula formula={chemical.formula} /> : 'Not set'}
      </DetailRow>
      <DetailRow label="Storage Category">
        {chemical.storage_category?.shorthand ?? 'Not set'}
      </DetailRow>
    </Stack>
  </CardContent>
);
