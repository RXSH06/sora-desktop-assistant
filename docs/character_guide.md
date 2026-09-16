# Customizing & Replacing the Character Avatar

The Nova Assistant character engine is decoupled from the agent logic via `@assistant/character`.
The current default renderer is an interactive, animated SVG robot ("Nova") with responsive eyes, antenna LED, glowing chest core, and mouth sync for all 8 states.

## Supported Avatar Types

The architecture supports pluggable character renderers:
1. **Vector / SVG** (Default, zero dependencies, ultra crisp at any resolution)
2. **2D Sprite Sheet**
3. **Live2D Avatar** (via pixi-live2d-display)
4. **Lottie Animation** (via lottie-web / lottie-react)
5. **GIF / WebM Loop**
6. **3D Model / VRM Avatar** (via Three.js and @pixiv/three-vrm)

## Swapping the Avatar

Implement your renderer component conforming to:

```tsx
interface CharacterProps {
  state: CharacterState; // 'IDLE' | 'LISTENING' | 'THINKING' | 'EXECUTING' | 'SPEAKING' | 'SUCCESS' | 'ERROR' | 'WAITING_FOR_CONFIRMATION'
  size?: number;
  onClick?: () => void;
}
```

In `apps/desktop/src/renderer/App.tsx`, import your component in place of `<Character />`:

```tsx
<MyLive2DAvatar state={characterState} size={config.characterSize} onClick={...} />
```

All agent reactions, state synchronization, speech bubbles, and confirmations remain identical.
