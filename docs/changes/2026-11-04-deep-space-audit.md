# Deep-space audit and 30 km camera range

Both the main and sky cameras now use a 30,000 metre far clipping plane. TypeScript/Vite production build and all 67 simulation tests passed. Visual depth precision and real browser performance are not certified by those checks.

Issue #8 has partly landed already: Kepler is at (200,3200,-2800), ships can leave the 650 m basin, and Mercury capture exists. The old audit describing y=650 everywhere was stale. Do not move Kepler back to y=1800 or close the whole issue based on the camera fix: deep-space vertical bounds still clamp at4500, and the complete warp/multiple-planet landing acceptance needs a browser pass.

Issue #10 is not complete: public/assets is approximately181 MiB; Earth is approximately20 MiB and the Blerk directory approximately23 MiB. Some high-detail models are background-loaded sequentially, but this does not meet the10 MiB total or a measured1.2second cold start. No claim of those targets or guaranteed60fps is made.

Issue #11 is partial: room query parsing and basic screenshot download exist. The screenshot is still a raw canvas PNG. The metadata poster, QR card, copy-image flow and end-to-end second-device invitation acceptance are not implemented. Issues #7 and #9 remain feature backlogs; their full acceptance has not been verified in this audit.

GitHub branch creation on the other two repositories returned403 with the linked integration. This local fix has not been published, deployed or used to close an issue.
