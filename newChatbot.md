Chatbox UI Layout & Structure
1. Overall Structure

The chatbox consists of one large rounded container that holds three main sections:

Chatbox Container
│
├── Welcome Message
│
├── Message Input
│   ├── Message Field
│   └── Input Controls
│       ├── Add Button
│       ├── Microphone Button
│       └── Send Button
│
└── Suggested Prompt Chips
    ├── Prompt 1
    ├── Prompt 2
    └── Prompt 3


The entire composition is centered horizontally within the available chatbox.

2. Main Chatbox Container

The outer container should:

Occupy the available chat area.
Have consistent spacing from the surrounding edges.
Maintain a large rounded rectangular shape.
Keep its content inside the container without clipping.
Scale vertically based on the available viewport height.

The container should not use a rigid fixed height that could cause the top or bottom portions to become hidden on smaller screens.

3. Welcome Message Section

The welcome message is positioned toward the upper-middle portion of the container.

Structure:

┌───────────────────────────────┐
│                               │
│                               │
│     How can I help you        │
│          today?               │
│                               │
└───────────────────────────────┘


Layout requirements:

Horizontally centered.
Positioned above the message input.
Maintain noticeable vertical spacing between the welcome message and input.
The message should remain visible on smaller screens.
4. Message Input Section

The message input is positioned directly below the welcome message.

It is a horizontally centered, rounded rectangular input area.

Approximate structure:

┌────────────────────────────────────┐
│                                    │
│  Send a message...                 │
│                                    │
│  +                            🎙  ↑ │
└────────────────────────────────────┘

Input Layout

The input consists of:

Placeholder/message area
Bottom-left action button
Bottom-right microphone button
Bottom-right send button

The controls should be aligned along the bottom edge of the input.

5. Input Controls
Left Control

The add/plus button is anchored to the bottom-left of the input.

┌─────────────────────────────┐
│                             │
│                             │
│  [+]                        │
└─────────────────────────────┘


It should maintain consistent spacing from the left and bottom edges.

Right Controls

The microphone and send buttons are grouped together at the bottom-right.

┌─────────────────────────────┐
│                             │
│                      🎙  ↑   │
└─────────────────────────────┘


The microphone sits immediately to the left of the send button.

Both controls should remain vertically aligned.

6. Suggested Prompt Section

The suggested prompts are positioned below the message input.

They are arranged vertically and centered horizontally.

        ┌───────────────────────────┐
        │ Prompt 1                  │
        └───────────────────────────┘

        ┌───────────────────────────────┐
        │ Prompt 2                      │
        └───────────────────────────────┘

        ┌──────────────────────────────┐
        │ Prompt 3                     │
        └──────────────────────────────┘


Each prompt should:

Size itself based on its content.
Be horizontally centered.
Maintain consistent vertical spacing from the other prompts.
Remain on a single line when sufficient horizontal space is available.
7. Vertical Layout

The overall vertical relationship should be:

┌─────────────────────────────────────┐
│                                     │
│                                     │
│          Welcome Message            │
│                                     │
│                                     │
│       ┌─────────────────────┐       │
│       │   Message Input     │       │
│       │                     │       │
│       │ +              🎙 ↑ │       │
│       └─────────────────────┘       │
│                                     │
│          ┌──────────────┐           │
│          │   Prompt 1   │           │
│          └──────────────┘           │
│                                     │
│        ┌───────────────────┐        │
│        │     Prompt 2      │        │
│        └───────────────────┘        │
│                                     │
│       ┌────────────────────┐        │
│       │      Prompt 3      │        │
│       └────────────────────┘        │
│                                     │
│                                     │
└─────────────────────────────────────┘


The design intentionally leaves substantial empty space around the content.

8. Horizontal Alignment

All primary elements should share the same horizontal center axis:

                CENTER
                  │
                  ▼
        ┌───────────────────┐
        │   Welcome Text    │
        └───────────────────┘

       ┌───────────────────────┐
       │    Message Input      │
       └───────────────────────┘

          ┌───────────────┐
          │    Prompt 1   │
          └───────────────┘

         ┌─────────────────┐
         │     Prompt 2    │
         └─────────────────┘

        ┌──────────────────┐
        │     Prompt 3     │
        └──────────────────┘


The input should be wider than the individual prompt chips.

9. Responsive Layout

The structure should adapt to different screen sizes without changing the overall hierarchy.

Desktop / Large Screen

Maintain:

Large outer container.
Generous vertical spacing.
Centered welcome message.
Full-size input.
Three vertically stacked prompt chips.
Smaller Screen

Reduce the vertical spacing between sections when necessary.

The layout should never allow:

The top of the container to be clipped.
The welcome message to move outside the visible area.
The input controls to be cut off.
The prompt section to overlap the input.

The hierarchy should remain:

Welcome
   ↓
Input
   ↓
Prompt 1
   ↓
Prompt 2
   ↓
Prompt 3

10. Recommended Layout Model

Use a flexible vertical layout rather than absolute positioning.

Conceptually:

Container
  │
  ├── Flexible top spacing
  │
  ├── Welcome
  │
  ├── Spacing
  │
  ├── Input
  │
  ├── Spacing
  │
  ├── Prompt List
  │
  └── Flexible bottom spacing


The important point is that the elements should be flow-based and responsive, rather than individually positioned with fixed screen coordinates.

This will prevent the issue where the chatbox looks correct on one PC but the top portion becomes hidden on another screen with a different viewport height.

11. Layout Priorities

When adjusting the UI, preserve these priorities in order:

Entire chatbox remains visible.
Welcome message remains visible.
Input remains fully accessible.
Input controls remain anchored correctly.
Prompt chips remain centered and stacked.
Vertical spacing can compress when screen height is limited.
Horizontal proportions remain consistent.

No color, font, shadow, or other visual styling is defined in this specification. The reference image should only be used as the source for the layout, positioning, proportions, spacing, and structural hierarchy.