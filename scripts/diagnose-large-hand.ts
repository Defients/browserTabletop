import { availableActions, fixture } from '../packages/intrilex/index.js';

/** Synthetic rules fixture only: no live room, sessions, or private user data. */
const hand = ['2♣', '2♦', '2♥', '2♠', '3♣', '3♠', '4♣', '4♠', '5♣', '5♠', '6♠', '7♠', '8♣', '8♠', '10♦', '10♣', 'J♣', 'J♠', 'Q♣', 'Q♠', 'K♠', 'RJ', 'BJ'];
console.log(JSON.stringify({ profile: 'intrilex-full', hands: [hand, ['A♥', 'A♦']], pr: [[], ['9♥']], exile: ['10♥'] }));
try {
  const state = fixture({ profile: 'intrilex-full', hands: [hand, ['A♥', 'A♦']], pr: [[], ['9♥']], exile: ['10♥'] });
  console.log(`Enumerated ${availableActions(state, 0).length} legal actions.`);
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
}
