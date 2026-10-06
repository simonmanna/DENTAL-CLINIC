import { normalizeSurfaces } from './dental-notation';

describe('normalizeSurfaces — anatomical folding per tooth', () => {
  it('folds the bite surface', () => {
    expect(normalizeSurfaces(['INCISAL'], 36)).toEqual(['OCCLUSAL']);
    expect(normalizeSurfaces(['OCCLUSAL'], 11)).toEqual(['INCISAL']);
  });

  it('folds the cheek/lip side (incl. FACIAL)', () => {
    expect(normalizeSurfaces(['LABIAL'], 46)).toEqual(['BUCCAL']);
    expect(normalizeSurfaces(['BUCCAL'], 21)).toEqual(['LABIAL']);
    expect(normalizeSurfaces(['FACIAL'], 16)).toEqual(['BUCCAL']);
  });

  it('folds the tongue side by arch', () => {
    expect(normalizeSurfaces(['PALATAL'], 36)).toEqual(['LINGUAL']);
    expect(normalizeSurfaces(['LINGUAL'], 16)).toEqual(['PALATAL']);
    // primary teeth: 55 upper, 75 lower
    expect(normalizeSurfaces(['LINGUAL'], 55)).toEqual(['PALATAL']);
    expect(normalizeSurfaces(['PALATAL'], 75)).toEqual(['LINGUAL']);
  });

  it('dedupes after folding and keeps charting order', () => {
    expect(normalizeSurfaces(['LABIAL', 'BUCCAL', 'M', 'O'], 36)).toEqual([
      'MESIAL',
      'OCCLUSAL',
      'BUCCAL',
    ]);
  });
});
