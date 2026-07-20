---
description: Open the current HTML artifact in the annotron review editor and start the feedback loop.
---

Open the most recent HTML artifact ($ARGUMENTS or the last .html file written this session)
in the annotron review editor, then run the full feedback loop:

1. `annotron <artifact.html>` — open editor in browser
2. `annotron poll <artifact.html>` — wait for user feedback
3. Apply feedback, then `annotron poll <artifact.html> --reply "..."` to notify the user
4. Repeat until poll returns `finalized: true`
