import { FilterMode, Image, MipmapMode, useImage } from '@shopify/react-native-skia';
import { useMemo } from 'react';

import { TOKEN_FRAME, TOKEN_IMAGES } from '../assets/tokens';
import type { LineupToken } from './placeholderLineup';

/** Base-disc diameter on the pitch, in metres. Larger than life so tokens stay legible. */
const TOKEN_DISC_METRES = 4.6;
const TOKEN_FRAME_METRES = TOKEN_DISC_METRES / TOKEN_FRAME.discWidth;

const SAMPLING = { filter: FilterMode.Linear, mipmap: MipmapMode.Linear } as const;

function TokenSprite({ token }: { token: LineupToken }) {
  const image = useImage(TOKEN_IMAGES[token.kit][token.number]);
  if (!image) return null;
  return (
    <Image
      image={image}
      x={token.position.x - TOKEN_FRAME.anchorX * TOKEN_FRAME_METRES}
      y={token.position.y - TOKEN_FRAME.anchorY * TOKEN_FRAME_METRES}
      width={TOKEN_FRAME_METRES}
      height={TOKEN_FRAME_METRES}
      fit="contain"
      sampling={SAMPLING}
    />
  );
}

/** Draws tokens in metre space; must be rendered inside the pitch's metre-space group. */
export function TokenLayer({ tokens }: { tokens: readonly LineupToken[] }) {
  // Painter's order: tokens nearer the bottom of the screen overlap those above them.
  const ordered = useMemo(() => [...tokens].sort((a, b) => a.position.y - b.position.y), [tokens]);
  return (
    <>
      {ordered.map((token) => (
        <TokenSprite key={`${token.kit}-${token.number}`} token={token} />
      ))}
    </>
  );
}
