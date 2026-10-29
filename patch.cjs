const fs = require('fs');
let content = fs.readFileSync('src/screens/ChatScreen.tsx', 'utf8');

content = content.replace(
  /<\/div>\n\s*\}\)\n\s*\)\}\n\s*<div ref=\{messagesEndRef\} \/>/g,
  `</motion.div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />`
);

content = content.replace(
  `{msg.text && <div className="whitespace-pre-wrap">{msg.text}</div>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />`,
  `{msg.text && <div className="whitespace-pre-wrap">{msg.text}</div>}
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />`
);

fs.writeFileSync('src/screens/ChatScreen.tsx', content);
