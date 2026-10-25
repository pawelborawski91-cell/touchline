import blue02 from '../../assets/tokens/blue_02.png';
import blue03 from '../../assets/tokens/blue_03.png';
import blue04 from '../../assets/tokens/blue_04.png';
import blue05 from '../../assets/tokens/blue_05.png';
import blue06 from '../../assets/tokens/blue_06.png';
import blue08 from '../../assets/tokens/blue_08.png';
import blue10 from '../../assets/tokens/blue_10.png';
import blueGk from '../../assets/tokens/blue_gk.png';
import red02 from '../../assets/tokens/red_02.png';
import red03 from '../../assets/tokens/red_03.png';
import red04 from '../../assets/tokens/red_04.png';
import red05 from '../../assets/tokens/red_05.png';
import red06 from '../../assets/tokens/red_06.png';
import red08 from '../../assets/tokens/red_08.png';
import red10 from '../../assets/tokens/red_10.png';
import redGk from '../../assets/tokens/red_gk.png';

export type TokenKit = 'blue' | 'red';
export type TokenNumber = 'gk' | '02' | '03' | '04' | '05' | '06' | '08' | '10';

/**
 * Every sprite is a 256×256 frame normalised so the base disc has the same width and its
 * centre sits at the same point. Values are fractions of the frame size.
 */
export const TOKEN_FRAME = {
  anchorX: 0.5,
  anchorY: 187 / 256,
  discWidth: 176 / 256,
} as const;

export const TOKEN_IMAGES: Readonly<Record<TokenKit, Readonly<Record<TokenNumber, number>>>> = {
  blue: {
    gk: blueGk,
    '02': blue02,
    '03': blue03,
    '04': blue04,
    '05': blue05,
    '06': blue06,
    '08': blue08,
    '10': blue10,
  },
  red: {
    gk: redGk,
    '02': red02,
    '03': red03,
    '04': red04,
    '05': red05,
    '06': red06,
    '08': red08,
    '10': red10,
  },
};
