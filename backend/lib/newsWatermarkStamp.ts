/**
 * 網址浮水印的文字圖章（760×101，透明底，不透明度已烙進圖）
 *
 * 為什麼是內嵌的 PNG，而不是 SVG <text>：
 *
 * 2026-08-29 第一版用 SVG `<text>` 排字，本機（Mac，有 Helvetica）看起來完全正常，
 * 上到 STG 之後**整張圖沒有任何浮水印**。逐像素比對 R2 成品與原圖：明顯不同的
 * 像素 4.8%（全部來自右下角那塊 logo 白墊），沒蓋 logo 的左上區塊亮度差
 * 每子像素 −0.24 —— 白色半透明文字蓋上去必然讓亮度上升，它沒有。
 *
 * 原因是 Vercel 的 serverless 執行環境沒有系統字型：librsvg 找不到字就
 * **畫一片空白、不拋錯**，而 stampUrlWatermark 的 catch 是「失敗回原圖」，
 * 於是整條路徑靜靜地什麼都沒做，沒有任何錯誤訊息。
 *
 * 改成把文字先在本機排好、存成 PNG 內嵌進原始碼，執行期只做縮放／旋轉／平鋪，
 * 完全不碰字型。這樣本機預覽與線上成品保證長得一樣。
 *
 * 要改字或改濃淡就重跑產生器（字級 100、Helvetica bold、白字 0.45 疊
 * 黑影 0.25 錯開 1/14 字級、trim 去透明邊）：
 *
 *   const svg = `<svg ...><text ... fill="#000" fill-opacity="0.25">www.ggb.com.tw</text>` +
 *               `<text ... fill="#fff" fill-opacity="0.45">www.ggb.com.tw</text></svg>`
 *   const png = await sharp(Buffer.from(svg)).trim({ threshold: 1 })
 *     .png({ compressionLevel: 9, palette: true, colours: 64 }).toBuffer()
 *   console.log(png.toString('base64'))
 */
export const WM_STAMP_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAvgAAABlBAMAAADKa4pkAAAAMFBMVEX////Dw8NMaXEBAQHe3t78/PwCAgIHBweXl5f+/v49PT3/' +
  '//+wsLBsbGz+/v4BAQGLhifWAAAAEHRSTlNzlgBAhA4NJHIrTV6EXUUyMu3QxwAAAAlwSFlzAAALEwAACxMBAJqcGAAAGNZJREFU' +
  'eNrtnV9oJEd6wHuO8YPRYdRoHhQxSkSbkTMRmc1OX2Z0iuSZBkGc5GwGkU3iGPwwG3bJ05HZYIWExAgdYXPYySBiyOJgWBQSc5xh' +
  'zuQCYQ+D0MvieBOWCWQxWW5iOBJj2IcR8cLlQamqr+r7U92tPyuB8DL9Inq6uv78vq+++qrqq1YQffWu2h1zfRh91a/gK1jnpcBc' +
  'X5vAn8CfwJ/An8C3V+WWuT6fwL8I+FDD5ybwJ/DPG36SJD93eHg4gX8R8MMwnInjeAJ/An8CfwJ/At/BL66vv7K5udmdwL8A+IUw' +
  'nFU17E3gT+BP4E/gT+BP4F88fLUC9c5G/uMrt25dOQZ+5co7V05UlMorL2XlvUd37jz6fOeoir56RdTzylHVPgX8yhVzYWZwe8X9' +
  'db8fkyySySKZLLumlS+0Nzz1eU661wf68Uc7fq4MfuVdnWbqJ8eif8/kZcvKqoUpKg9o9QvxuGJy+2jnhPBzCSn4C1Dys/ZZzdYk' +
  'Gsj1qw7cPiNXt6bsfCJwm3p9ebtwxHSjaksI/llXJJXuXft0agdL+8yDv8JzOEoTR45v8NxOXi1sUXgtYJkuiX3scpvKpv/eo0eP' +
  'AH755s2bf7lRtZm71APMN0Cqz0mqz0UjKZS+vEWReTIaSRl5Istp9WcZ8N8lJBt58LcwzbMnZJ9CxtkzQtTCnaiCSZ6TuWXTt48V' +
  'fH21dyoBr7xrqVbPAKlO+VQ92iOJB6l6MhpkiuxrRxNReH34NUbkhznwvx/yNPnXSPCd4salItnzh6j5fVkKu332JPAdkg/F0oNG' +
  'ElDVfKqexRhIGaF56Yh6VAL51khKnV2vBQKvB19C2ciEvxKGPE0u+9ckX4GsH+Q+dJpf5bJRXYWn/uwk8KUxcO8/Y+APZO2R6pIU' +
  'SiBvkaqUUTWQMhqkenMm3akND74E9sNM+LcF/FzD4ys3R1YNgtyHTvM78mk/OKbQFHxpQmr0akBUdzyqVSGUiqdhSLUmhFINMkW2' +
  'kbcdBStQqjgPPgFbX28HU1nw5/YQfvso1WfwTFHcuPXZoyQs6cfP+ppPVVHFPFMJ+G1WoSn4Uj2XyDYERPUz0ewNfLAjqe4IqpEn' +
  'o1qQJbKpfDu8bqpY+jUJH7NJzOP1dzPgl0OAXzRpSnlWHxUf0qmUbeyI2Khi6C56aJk9EhV9ZUnktv7hCeAvCQgLZBsCqIBOth/H' +
  'XUtVZaxc1L1pk8G2mUjWXLJtk6wCt2Xl7oVtk2wYtyyYItzGrnXg8MrpRlXABYxsWtL3mJSgcFV2E+HTW3C9cuSOL+Mbrnu+GNVC' +
  'F/UMg6/u96B0l+Q7Am34M5nwVQ9bd6L+j80/asPbpvKmzALcBkR1xrS7ApXRFLbaRRIKUoVbS3Vey6jNZNRxyUBGNvM5Db+bYQuo' +
  '1SUOv5LiNZ0Hn6XZOcrVYenC8GelcePsVU0kfKwbdg2eW/nLTPgsu2G8UoLXd4169h38XQUfqSpCY0H1PsAHoSy4ZHDLqG5xoWDW' +
  'QmT7sb8OM0oRmWbwa2koefBZkn/r5m8qCfZh+Pe8+xXks/DP0/CLoib8dtg7Fn5s4YMxGLkShwo+UlW860hVz90vQ+EgFOwtcMuo' +
  '3ucdB+HDre0ICprpcj4Sozt7rlEEv0NQPkHZZMLn4GYb+VZHPb758CYm3e5R91P1K3+6u/KBq0c41/Xh3/mR0JKP/uctyqnpl/jq' +
  'rVt/Y7vFQ3WpFn2HG4OB06ptBR+pqoY3BNVVKByEglThllH9BpfRyGUNt/YtJfO4kUaiZ+Dq0doWNIrgjxywe7tx/MByzoBffgff' +
  'NlY0Q/X7tiRdULzmAM80qfspG7ure+aKy2i2KeHP/sNivLJHZukni3H8vrvbz1o6e8FmFMP179w2YJfeV/CRatm0jFFdhlQglJGU' +
  'kX1L1/pFSAZCQbnCrX1L16CeNvmqTGi2aVkJ4VecaO6ZukNDpzPgDy/p50h/mKH6A1vStslq1aacp5GlCLqhRePy2e1x+OXd5iX2' +
  'MJzvXtX93YkxbhwL/xvMNlRcj1e3AVGF0ZhR/WV4UDa0kSrIiFH9JpNRBeU6y94q62TjlMl3g4ESsyk/cfCrViPLtvKmoaU0/I/j' +
  'AwFtP84x+QXksOewNNzIkpjxjcrRxTQ4/P24eUOIeHyAVdYIW8fC/xU0IWNyLtVtQFTBWQSqptl19ImarLfA7QB9ovh/mYwoaxAZ' +
  'a10vpY9EF1sG8JesaD6OPZWU8KHbMGhzUsI0YUApx7dDV7uu9bhdpxBAuwy+clL0w8tYxSYX41zWkr0H/0VUzzo5l+o2MHy+tYfO' +
  'IqPaGzmXvQUaNEsy4lQHJKMqJdO3tiOkPM1KwFxQbg4AfiegoYI31IM/70ObT5uAJWlZsCBdTD8gRRPlzBshWvhlr5A5qS9zcVri' +
  'PnxuQsyYOgsKEADVLRwQGNVuH0dpoDqPMhJUmYy0XItzKKMqU7uUPhaZzq0I+H2vXzh99eDj2zG9nbm2wAC7TrSrOIw8q4NdqGxc' +
  'Mwt/1ntzX6adizOMvge/wUyIcS7vgQIEQPW+GxAs1RmDq0NTX6CKMmJUWxGTkZHrDMqoRv26mdJHO7Lo69DpEcAfyX7ROljOhL8b' +
  '+1YrbQL6NG3ROW1uJs77bkbSIj2+Fl37A8yni/Ddqz+lOujbx3/oekncTI80MMPVrfnymrqseu6qpMa53AYFCAyfucvOfAmqSzRK' +
  'A1WUkaC6QDIyvtI+ymiJ+rxQjwVcnNCXniT+NYcvRuOWXsxIMuDbtx+r57+H+lzPmN8WYdoCBQ0Sl1NFdL83TI8sOtGMEf6cfVyx' +
  'UydjwJpdRdF5da1j93D7ZBuMQzM06jkMgOqqG40t1aGhWoOBQgsFqKKMLNXd2JqxxArFZL2NMrJ+a7an6bqlmaAvFQl+xfYLoGLG' +
  'CkJG8OHtBnvb6HPa03RytM8ObHf5fd79GhaaK6ch4X9pFr0S7G+mY7ipaXws/A7aSXBodo16bgfGBu0v25bXBdUK2CotFKCKMhJU' +
  'qyQjkCvKqE8Gd+wbg6JtV8uOAgnCr1rPakjvjYpp+HOuX+DbdnFPBAgwOVqTdMnC/zNaQkR3wGr3vi5mgfbpW5BV0cFvQO9NTgp/' +
  'iWyD1oZvwYCxH4ANWnPeIVAtW10F+FooQBVl1CfnecxlZCa4McoI/Na0p2lnCTNEtwYtI/hOx5y0khT8GdLYaoDC6abdfCtHJ5dF' +
  'C///mO1rYkexk89YwG9YOcJ4AI1ZwFanJ9Y+/BrZBl3oS+BBzARAdcVMYlQlGFUzzS9aoQDVNT0TcreWqlmucDICuS7rZO62kLGm' +
  'aeHv04MqtMxU17nCBFf122IKPnu7gssl3ojr5pNi1DnAqY/OdZb3yxFbmGLwxxZ+YmtlpwHFk8KvgqDmzKRI+Td60qB8xcBw0M7a' +
  'uplOSKp2oFBNBqorJpm9LYDudbmMQK5KRgW8Tezo7cNPAF8Tq1vg8IuhsFZkNCX8FloXt6wtnW7eifDJVYD/Swx+FytGC7wMfk/C' +
  'b0WnhB9hL/mm8W+0bVA+bgBU1fRi3ejHiKhSm5UpBapKRmZAaEmqJCOQ64pJZm+TtKdphkHrtTWwusUs+F2En/jw2dsR7TXUU/CL' +
  'Fj4ieh5XXDSSea4afVwkrHP4XQu/APCbbPXhZPBHrnUvaiQzyjaolazZwFLdCsFzlFSXHPw1oKpkZDzHFUkVZbQMco3DkpHRGrlO' +
  'jTz442z4BYDfIt+0kAV/TBla+I1M+MLw2RH37wh+k8FP3MwpH37j1PBRPY2t21e2QcEvm13geT1fM979SttQHdoK2YFiHzCqKm2V' +
  'jIwsVTfwL3H4RVXbvVIRZZHhaXL4PaquB3+WUcmD3zsGfo2ItbImvwnQazD41jg3zxV+x00LdXcrbivbMK0IGfiqrNslM69dawuq' +
  'VTdKL7eB6v2SkdGySeZ8IpLRKsjVycjcyhENWRUtvi5VN2HwE9D8BsEvZsHvUoZQA8++1TxbkQO/nobf4vCjs8JH9bxt/BtlGwz8' +
  'aaB6uWSWapankeqYBgo1QLSBqpWRuaVtcTtazsSX20au8f1pIyNzm+FpcvjRieB3cuBHEv62z7h6DHxLb3w6+PVTw6+5+t03cyy9' +
  '8R1Y+Irqasl4mKvTgqpqFIzol6eBqvqrZWRu0SciGd1vg1xvTxsZ3Tbw056m2+bcJ2OQA78uQaW8HTaXKuTBT2DATS1/MXo9r2K6' +
  'yucKv+p65lbbOJf6r4JfAqrL0wY+UCVcfTsMKlU2VFenjSN62ySbwUnQyMpoaxqyvtw2MjJvZXiaro0z9KDKqlsjp27MpsQZ8Ftp' +
  '+K3Twp/NgG/s/HnCj5xtUBqvnUutpgBfU12bNusAt0uSascuYd0vAVVl7AtOFoyqk5GGr7NebRsZGVlkeJq6jdi7hXHGGa4ldhT8' +
  'GdlvCjCXyoY/jLOX+u36XM+zh+cPf2B7lI48eQmCExKAr1m3zZKOgWxwtfhAoUdQQ3WtbWS0ZZINkaqT0V4Jsl6GafLetC5iN+Vp' +
  'OtPKlmOXMuAP+cwzDX+O3q7mwa9QVvWsTS4Lv8t6kLWH5wwf1HN+RQcgzUNwgoKvwlC+jvCHyt0XVO1AseuoxrDspm85VScjHV70' +
  'spYRrKeFJlna09TCsvNZ5ktidSsUQjdm62M+fCY659Ts5sHfxirQMZEabQt0+eFl50idK3xQz9k1DX8G4BcMfEN1ZNbn90JJ1Q4U' +
  'Qx0qpKnGpvt8qm+TMlG1MvpA09YDRsu0YU3fZnmaznkJCV+fVzfAqc5YrhL4S8pev8lw5wP0Qet+2HQ1cP4f0nNzsuG5wwf1LC9r' +
  'JPsQdaDht4GqmVjv62i4hC+qQIFva9qGqpGRueUBmNbXfKB/15VtGhmZ2yxPU1elIJeAB7y6A9xwHrOdr9ROFsHvpOfE0gedcfAr' +
  'LI6XOliPCRFXI84VvlXPVR39tg3bukUD31A1qyfzGr4Ia4WB4q7+3VA1MjK3zNN0MlIRYcZvNaueYfiWgT8Tp1e8axh62GKqnbBt' +
  'RBtZOhabLx58Et0oY6UAn1BQEQvQZdNiFn/Q4atK5wrfmpD7mtAQIkM0/GmgavYGZg1V7pjDQKGisdtA1ciobJJxquBrfqKTabnW' +
  'jYz29G2Wp6mrUhQ73h0Bv4MrxHWK8k5Nskh0butrLg3fLtaUnR2tsXBtu4pWFqsUuNB5rn6+sw36SEHBLLEOAD5QtXuBOiaSU+24' +
  '4LBpoGr3b3yqfRcb2jZyHXcomfU07Tffbm3wVUilvCyGPmFxOwmGNrljKmn4KLpaQPsDTR0rqa933ECeuGgFFh39LG/bUAwtVoin' +
  'hG9bt5N7DnfgwkrBuexp2xA4qjVrhqeLzNOM3Oa4/t1QRRkVmU/EZWTk2kMZFdzoXROHJuy6uapelw4B4Yyn5uKzIAoVRJOGr2rQ' +
  'pRCFxC0yixN6NQyabqQOS9YwrLQu4kysWp0GvnfisEJjUE/uFCgkX7dhORp+CajazRa9GMyXgJGDpYoyKgj/fYngG7mijArO06yJ' +
  'gy0dV5WPdeVeDyT8igtgLP+Yji0W0vDnAb6LLrQ1EvCrGGHa5OPtP6l4jq7b/yrvMuvmgrWa5wwf1bP9kgvLSRR8oGoX1PU6M9u+' +
  'cwOF/j22EyCQUUFsi5OMTNZdlFHiRm+p+Sis8F9v3fqCQugxStn20fLnt95jJxj8QNntMWlz6FZZ5dlU190/bnHdBv2yO7bhfJMF' +
  'NNtgrcYJ4c8dAT9k8MmEvOz6lYIfAlXr16hbQRWVsARUUUaJOOpDMgK5oowS5xNJza8g/BKeLyuELD6/wM+B5MIP/2IjenUU8ODD' +
  'sQe/77L6LnaxgsOLxdxTKlF51+Uzfxr4R2k+31Mm9ZxzYTkF9T5QjUa2RZIqDRRAFYfKZD6W83Iro183ckUZ4T6v1HxVWkIHPYgu' +
  'nkwp0nGggA5SpOCT6FxwTs+DjwYu/I0vsA/NQx+poYyDO3eonH0Q4jlofvjJ3X/Z8NVzn8MHx4rgyyVgHCjmYBh2yTz/3fUb83OT' +
  'ZIQ+kdR8NcQmvm6HbIlxkKJbyIQf8n6zi1rE4FfTcoT9TxPzUkx1MJdP7yyaH4nTiJ4JAbegCvAt1b5rkQxr7XDYTQZ/W/jvfQ67' +
  '4SWzO5LmkN7m5nXYfykIvFN48sLA7wTi/FlghZGG3yaiszGqhzq8u/6rm29sRlyO0yRli1fVOtWDXOBs99Sar1v335ubb2TDJxMy' +
  'dDFRxQCpLqB/J6YqC1wmDSajoUjW4bA5fOcT1bzF3X5R8PthEHL4VewYBstUp5CGv8epsZDAkYzp6PgGroh4MdKN9SAb3daKTq35' +
  'fENhkIaPJsSGsQwMfEt1ic5I8CXgGpdJg8lIrhQvcZnUSUZ8n1dsa1QDfrwvuJII+FG/wI/gPvObGYGy97jqu7C/Rgp+1TdwBcSr' +
  '0iZet3DR5I3o1JpfYBs8I4Q/veOrZ0znzpBqjU4H8SXgKpdJnWTkBWDWuEzGJCMcvX34UZ8Oeq6vv/zTUMKv0mlKdSj/r25nwIdg' +
  '6JJTfIgmHqfgMzla3WYRtrWCtF8YGz1+MvhO8ztp+AtcHbtuf8hSrdK5OE4VBwpLtUbn4vhiZZUODZmfl+hcHDBIwa/8gB9WXfHg' +
  'R6+xp/NxJvxVd5rfHM3fjTF+TsKvinPsbrh1EbjicHMRDzR0zwYfNTks7Xjq6SLkOjj6jDFsKbUEPGAdokcy8rfFuei6VDr6RCn4' +
  '0c8T3Y/duQ+2GkInPNXZq0z48V7Is3C2xIcf9dnpcjrtYGNE2UHrdQy/N/mcxezQNDH88eHhl1w95y2RBYxp6tFil0/VDhSOaoUO' +
  'oouV4gGFGcdsWo+rb2n4EZ5lvRdnwL+0xc5wZ8NfZgegY7QlKfiV/+Lny+0xOueo/Y48ff5dyucJNd9tARao9g1uQuYoGjCgkMgB' +
  'xjsKqn3ywGO2ILntrRT3qd+0KPyPfKIM+FfXzEHu8tt04onFcSzGD4xm3x3SASg/euH7yN4eEeplwY9+kXWR8pDwmmLez2DPTyM+' +
  'kdlRk+kfePCdCZlhvvf3MApe7Wx+T1273qJ4hX5uQbLf0vdxfrImJPttl6zhvqn3x/BDgwLlVx4+/BSPmxVkEI0KJv7g4cNdd/qM' +
  'DkFXoKb6yfuA9a5lbytoiuaxsSt4XN+lpL59A4+lq68A2IdNV2Obj9v9/V1oQN173OUPnUb+woNP9HUTtc0ScV6iej8QfdCdmPGC' +
  'DQ54ndTlzqHVs5M15CEESnbDy/0GnQNchuP/HP4iPdUn3tqgReJsT+tq/MGDmw/xZJz7BMgLHuGr8drNT/Rk39FleqPSfvCWfEj+' +
  'hr334pvr3uMujzxveXWQ2iYyCERVbmRTveFlcuDXMTuZK6qXB5/hXTVr/zJ87CqHXwqy4LMWctgv5NzT1UvrDF1kTp8AfjPduIaX' +
  'HjfIxdMb2VSf9zK5kW4Bh1X3WtXNgx99G+t3OSy5PSTMdfGAnU5u2zMOEr4k14hy4PM+FvsG8yjJnEHzWZn+mRgMYxNPr2ZTveRR' +
  'veG3Tcpo7CWLcuFTBW+bmBU6BiKxrJggFB7v6uBf4grbzYW/GGd3Eb+H+ZI5C/xLafgeuEDk9nw21Rc8qld9qrK0niyqlQHfhS4t' +
  'uuroAFJ7UKhHXw52Ba+Vghz4XKfTUutGaRJ8bLCSkf2i1T0f+FS1RpTNNxBUL/nvS73pyTz8oOv0MOclQ/hV+qrqdYPxcZt2YXvs' +
  'M6uLb5r6/AmFdPjwyTZ9GR0Bn1k4n71Hn7M/i81n2TZ8FXATU306/RqmN3fXUqEQ8DMmW3zCZPgD+7Cnect8XcAd2ezhd+d27Dvu' +
  'HDk7q0JFgXzi1htH1ERf152UZEq43kT2j0/TIvE4g8r1Nw/19UZOfsFF/jcd+sBln22Bd/Hrhx/yM4XFzLgc0+rrm5vXTlDq9TcV' +
  '/8PsfyGzuHl4ELcOj/z/MtFT8o8pB3Ln53W+dd2l735upD+N1IyenuuC4LtPmk69E/HQEbsGWhUftKfQke046/sqE/invOgTu1Mf' +
  'PRrIrWv26eAguPPoC9pczZj/TeCf/qqlPyDtvg3TSn1z3Ys5mMA/+4ibpOMP3Ba4MvpZoSP7GZPvCfwnuPpZcTv4VZyMmCr7KZQj' +
  '/wHMBP7JrmoqJq1otzkgtiEVmJPYvaruBP45qH7B0+2Etq55bENbiqYVTeCfg9X/R7GtTV/5A9V+LfG/2r2duaQxgf9khodta5tP' +
  '8e2KdY+/pcfJOm6QP1XOzkX+h7g/5cEHyN5Nol74z6yN7adqvL1I+M/Tzipsoku6B++TcO4O4+z11gn8J7z0/vmDt8wm86cZO3h6' +
  '//ymfnr37WF6c3UC/4zXjTh9jaO8zafUWvsE/hlVP3/rOr2799Qp/sX+S9ZvHxVUwPfP4/jp8zMv/P/h+obH21s9eKqNzoX/M+I3' +
  'BV1/f0/Sbz5t7C/833BfJ76P03AXSThZO68T+Ge9rm0eHrYOH+fsni6qPeiDw8PNpxB9FP0//g+KMbI8txYAAAAASUVORK5CYII='
