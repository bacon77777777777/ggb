/**
 * cardx 的 SVG 圖示集（原本在它的 layout.tsx），`<use href="#icon-…">` 要它在 DOM 裡才畫得出來。
 * 掛在我們的 root layout，display:none 不佔空間；手機端多這一個隱藏的 svg 沒有任何影響。
 */
export default function CardxIconSprite() {
  return (
    <svg
              id="sprite"
              xmlns="http://www.w3.org/2000/svg"
              style={{ display: "none" }}
              data-v-195f05cf=""
            >
              <symbol id="icon-chat-3">
                <path
                  fill="currentColor"
                  d="M19.75 11.25a6 6 0 0 1-2.63 4.9l-1.17 2.58a.88.88 0 0 1-1.47.2l-1.3-1.55a6.8 6.8 0 0 1-4.25-1.47l.52-.62c4.04-.31 7.24-3.51 7.24-7.41q0-1.01-.27-1.96a6.1 6.1 0 0 1 3.33 5.33"
                />
                <path
                  fill="currentColor"
                  d="M14.76 5.31a6.6 6.6 0 0 0-5.95-3.56c-3.62 0-6.56 2.74-6.56 6.13a6 6 0 0 0 2.63 4.9l1.17 2.58a.88.88 0 0 0 1.47.2l.48-.58.81-.98c3.63 0 6.57-2.74 6.57-6.12q-.01-1.39-.62-2.57M11 8.53H6.63a.66.66 0 0 1-.66-.65c0-.36.3-.66.66-.66H11c.36 0 .66.3.66.66 0 .35-.3.65-.66.65"
                />
              </symbol>
              <symbol id="icon-settings">
                <path
                  fill="currentColor"
                  d="M10.03 22.5h3.94c.5 0 .95-.34 1.06-.83l.44-1.97a9 9 0 0 0 1.66-.93l1.99.6a1.1 1.1 0 0 0 1.26-.47l1.98-3.3c.25-.43.16-.97-.21-1.3l-1.54-1.37q.1-.93 0-1.86l1.54-1.36c.37-.34.46-.88.2-1.3L20.4 5.08a1.1 1.1 0 0 0-1.27-.47l-1.99.61a9 9 0 0 0-1.66-.93l-.44-1.97c-.11-.49-.55-.83-1.06-.83h-3.94c-.5 0-.95.34-1.06.83L8.53 4.3a9 9 0 0 0-1.66.93l-2-.6a1.1 1.1 0 0 0-1.26.47L1.64 8.4c-.25.43-.16.97.21 1.3l1.54 1.37a8 8 0 0 0 0 1.86L1.85 14.3c-.37.33-.46.87-.2 1.3L3.6 18.9c.26.43.78.63 1.27.48l1.99-.62a9 9 0 0 0 1.66.93l.44 1.97c.11.49.55.83 1.06.83M12 7.8c2.4 0 4.33 1.88 4.33 4.2S14.4 16.2 12 16.2A4.27 4.27 0 0 1 7.68 12c0-2.32 1.93-4.2 4.32-4.2"
                />
              </symbol>
              <symbol id="icon-chevron-down">
                <path
                  fill="currentColor"
                  fillRule="evenodd"
                  d="M5.35 9.34c-.47.46-.47 1.2 0 1.67l5.8 5.65c.47.45 1.23.45 1.7 0l5.8-5.65c.47-.46.47-1.2 0-1.67a1.23 1.23 0 0 0-1.71 0L12 14.16 7.06 9.34a1.23 1.23 0 0 0-1.7 0Z"
                  clipRule="evenodd"
                />
              </symbol>
              <symbol id="icon-notifications">
                <path
                  fill="currentColor"
                  d="m18.12 14.08-.84-1.39a3 3 0 0 1-.33-1.23V9.35a4.9 4.9 0 0 0-2.8-4.44 2.47 2.47 0 0 0-4.3.02 4.9 4.9 0 0 0-2.77 4.42v2.1c0 .35-.16.93-.33 1.23l-.84 1.4a2 2 0 0 0-.2 1.74c.2.56.67.99 1.29 1.2q2.45.82 5.02.81c1.7 0 3.4-.26 5.01-.8a2 2 0 0 0 1.09-2.95M14.36 18.68A2.5 2.5 0 0 1 12 20.33a2.5 2.5 0 0 1-2.35-1.66l.33.04a13 13 0 0 0 2.04.13q.71 0 1.41-.06l.52-.05z"
                />
              </symbol>
              <symbol id="icon-hamburger-open">
                <path
                  fillRule="evenodd"
                  d="M5.94 6.77a1 1 0 0 1 .04 1.42L3.32 11H21a1 1 0 1 1 0 2H3.32l2.66 2.81a1 1 0 1 1-1.46 1.38l-4.25-4.5a1 1 0 0 1 0-1.38l4.25-4.5a1 1 0 0 1 1.42-.04M9 6a1 1 0 0 1 1-1h11a1 1 0 1 1 0 2H10a1 1 0 0 1-1-1m0 12a1 1 0 0 1 1-1h11a1 1 0 1 1 0 2H10a1 1 0 0 1-1-1"
                  clipRule="evenodd"
                />
              </symbol>
              <symbol id="icon-search">
                <path
                  fill="currentColor"
                  fillRule="evenodd"
                  d="M11 5.94a5 5 0 1 0 0 10 5 5 0 0 0 0-10m-7 5a7 7 0 1 1 14 0 7 7 0 0 1-14 0"
                  clipRule="evenodd"
                />
                <path
                  fill="currentColor"
                  fillRule="evenodd"
                  d="M14.8 14.73a1 1 0 0 1 1.4 0l3.5 3.5a1 1 0 0 1-1.4 1.42l-3.5-3.5a1 1 0 0 1 0-1.42"
                  clipRule="evenodd"
                />
              </symbol>
              <symbol id="icon-chevron-right">
                <path
                  fill="currentColor"
                  fillRule="evenodd"
                  d="M9.34 18.65a1.2 1.2 0 0 1 0-1.7L14.16 12 9.34 7.06a1.2 1.2 0 0 1 1.7-1.7l5.65 5.8c.46.47.46 1.23 0 1.7l-5.65 5.8a1.2 1.2 0 0 1-1.7 0"
                  clipRule="evenodd"
                />
              </symbol>
              <symbol id="icon-like">
                <path
                  fill="currentColor"
                  d="M12 21s-7.5-4.6-9.6-9.1C.9 8.6 3 5.5 6.4 5.1c1.6-.2 3.2.6 4.1 1.9.9-1.3 2.5-2.1 4.1-1.9 3.4.4 5.5 3.5 4 6.8C19.5 16.4 12 21 12 21"
                />
              </symbol>
              <symbol id="icon-recent">
                <path
                  fill="currentColor"
                  fillRule="evenodd"
                  d="M12 4.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15M2.5 12a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0"
                  clipRule="evenodd"
                />
                <path
                  fill="currentColor"
                  fillRule="evenodd"
                  d="M12 7.2a1 1 0 0 1 1 1v4.1l2.4 1.4a1 1 0 1 1-1 1.74l-2.9-1.7a1 1 0 0 1-.5-.87V8.2a1 1 0 0 1 1-1"
                  clipRule="evenodd"
                />
              </symbol>
              <symbol id="icon-casino">
                <path
                  fill="currentColor"
                  d="M12 2.75c-3.4 0-6.2 2.53-6.2 5.65 0 2.1 1.3 3.91 3.25 4.88L7.9 20.5h8.2l-1.15-7.22c1.95-.97 3.25-2.78 3.25-4.88 0-3.12-2.8-5.65-6.2-5.65m0 2c2.32 0 4.2 1.62 4.2 3.65 0 1.46-1.03 2.76-2.63 3.34l-.82.3.84 5.46H10.4l.84-5.46-.82-.3C8.83 11.16 7.8 9.86 7.8 8.4c0-2.03 1.88-3.65 4.2-3.65"
                />
              </symbol>
              <symbol id="icon-sport">
                <path
                  fill="currentColor"
                  fillRule="evenodd"
                  d="M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17M1.5 12a10.5 10.5 0 1 1 21 0 10.5 10.5 0 0 1-21 0"
                  clipRule="evenodd"
                />
                <path
                  fill="currentColor"
                  d="M7 8.2c2.2 1.8 7.8 1.8 10 0-.3-1.1-1-2.2-2-3-1.3.9-2.7 1.3-3 1.3s-1.7-.4-3-1.3c-1 1-1.7 2-2 3m10 7.6c-2.2-1.8-7.8-1.8-10 0 .3 1.1 1 2.2 2 3 1.3-.9 2.7-1.3 3-1.3s1.7.4 3 1.3c1-1 1.7-2 2-3"
                />
              </symbol>
              <symbol id="icon-bag-dollar">
                <path
                  fill="currentColor"
                  d="M9 3h6l-1.2 2H10.2L9 3Zm-2.4 6.3c0-1.9 1.5-3.4 3.4-3.4h4c1.9 0 3.4 1.5 3.4 3.4 0 .5.1 1 .3 1.5l1.1 2.6c.5 1.2-.4 2.6-1.7 2.6H6.6c-1.3 0-2.2-1.4-1.7-2.6l1.1-2.6c.2-.5.3-1 .3-1.5Zm4.2 1.1c-.6.2-1 .7-1 1.3 0 .8.6 1.4 1.4 1.4h.3v.8h1v-.8c.9-.1 1.6-.8 1.6-1.8 0-.8-.5-1.4-1.4-1.7l-.7-.2c-.4-.1-.6-.3-.6-.6 0-.3.2-.5.6-.6.4-.1.9 0 1.3.2l.4-.9c-.4-.2-.8-.3-1.2-.3v-.7h-1v.7c-.2 0-.5.1-.7.2Z"
                />
              </symbol>
              <symbol id="icon-swap">
                <path
                  fill="currentColor"
                  fillRule="evenodd"
                  d="M7.8 7.2a1 1 0 0 1 1 1v1.3h10.7a1 1 0 1 1 0 2H7.8a1 1 0 0 1-1-1V8.2a1 1 0 0 1 1-1"
                  clipRule="evenodd"
                />
                <path
                  fill="currentColor"
                  fillRule="evenodd"
                  d="M4.8 9.5 2.6 7.3a1 1 0 0 1 1.4-1.4l3.9 3.9a1 1 0 0 1 0 1.4l-3.9 3.9a1 1 0 0 1-1.4-1.4l2.2-2.2Z"
                  clipRule="evenodd"
                />
                <path
                  fill="currentColor"
                  fillRule="evenodd"
                  d="M16.2 16.8a1 1 0 0 1-1-1v-1.3H4.5a1 1 0 1 1 0-2h11.7a1 1 0 0 1 1 1v2.3a1 1 0 0 1-1 1"
                  clipRule="evenodd"
                />
                <path
                  fill="currentColor"
                  fillRule="evenodd"
                  d="m19.2 14.5 2.2 2.2a1 1 0 0 1-1.4 1.4l-3.9-3.9a1 1 0 0 1 0-1.4l3.9-3.9a1 1 0 0 1 1.4 1.4l-2.2 2.2Z"
                  clipRule="evenodd"
                />
              </symbol>
              <symbol id="icon-box">
                <path
                  fill="currentColor"
                  fillRule="evenodd"
                  d="M6.7 7.4 12 4.7l5.3 2.7L12 10.1 6.7 7.4Zm-1.6 2.1V16c0 .5.3.9.7 1.1l5.4 2.7v-9.1L5.1 9.5Zm7.1 12.3 5.4-2.7c.4-.2.7-.6.7-1.1V9.5l-6.1 3.2v9.1ZM12 2.5c.2 0 .4 0 .6.1l7.2 3.6c.7.3 1.2 1.1 1.2 1.9V16c0 1-.6 1.9-1.5 2.3l-6.9 3.4c-.4.2-.8.2-1.2 0l-6.9-3.4C3.6 17.9 3 17 3 16V8.1c0-.8.5-1.6 1.2-1.9l7.2-3.6c.2-.1.4-.1.6-.1Z"
                  clipRule="evenodd"
                />
              </symbol>
              <symbol id="icon-missions">
                <path
                  fill="currentColor"
                  fillRule="evenodd"
                  d="M6 4.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-13a2 2 0 0 0-2-2H6Zm0 2h12v13H6v-13Z"
                  clipRule="evenodd"
                />
                <path
                  fill="currentColor"
                  fillRule="evenodd"
                  d="M8 9.2a1 1 0 0 1 1.4.1l1 1.1 3.5-3.6a1 1 0 1 1 1.4 1.4l-4.2 4.3a1 1 0 0 1-1.5 0L8 10.6a1 1 0 0 1 0-1.4Z"
                  clipRule="evenodd"
                />
                <path fill="currentColor" d="M8 15.5h8v2H8z" />
              </symbol>
              <symbol id="icon-promotions">
                <path
                  fill="currentColor"
                  d="M4 11.5v-2l11-4v13l-11-4Zm13-5.3 2.6.9c.9.3 1.4 1.1 1.4 2v5.8c0 .9-.5 1.7-1.4 2L17 17.8V6.2ZM6.2 14.6l1.1 4.4c.1.5.6.9 1.1.9h2.2l-1.7-6.5-2.7 1.2Z"
                />
              </symbol>
              <symbol id="icon-crown">
                <path
                  fill="currentColor"
                  d="M5 18.5h14v2H5v-2Zm0-10 3.2 3 3.8-5 3.8 5L19 8.5l-1.2 8H6.2L5 8.5Z"
                />
              </symbol>
              <symbol id="icon-gift">
                <path
                  fill="currentColor"
                  fillRule="evenodd"
                  d="M7.5 7.8h9c1.1 0 2 .9 2 2v2.2H5.5V9.8c0-1.1.9-2 2-2Zm-2 6.2h5.5V21H7.3c-1 0-1.8-.8-1.8-1.8v-5.2Zm7.5 7h3.7c1 0 1.8-.8 1.8-1.8v-5.2H13V21Zm-1-19c.9-1.1 2.7-1.2 3.7-.2 1 1 1 2.6-.2 3.6H13.5c.2-.9.3-2.2 0-3.4ZM10.5 2c-.3 1.2-.2 2.5 0 3.4H8.6c-1.2-1-1.2-2.6-.2-3.6 1-1 2.8-.9 3.7.2Z"
                  clipRule="evenodd"
                />
              </symbol>
              <symbol id="icon-docs">
                <path
                  fill="currentColor"
                  fillRule="evenodd"
                  d="M7 3.5h7l3 3v14c0 1.1-.9 2-2 2H7c-1.1 0-2-.9-2-2v-15c0-1.1.9-2 2-2Zm0 2v15h8v-12h-3v-3H7Zm6 0v2h2l-2-2Z"
                  clipRule="evenodd"
                />
                <path fill="currentColor" d="M8.5 11h6v1.8h-6V11Zm0 3.5h6v1.8h-6v-1.8Z" />
              </symbol>
            </svg>
  );
}
