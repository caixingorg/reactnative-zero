// 原因：替代长期停维的 Babel 6 插件 babel-plugin-transform-remove-console；零外部依赖，支持 exclude 白名单（如 error/warn）
module.exports = function stripConsolePlugin({ types: t }) {
  return {
    name: 'strip-console',
    visitor: {
      CallExpression(path, state) {
        const callee = path.get('callee');
        if (!callee.isMemberExpression()) {
          return;
        }
        const object = callee.get('object');
        if (!object.isIdentifier({ name: 'console' })) {
          return;
        }
        // 避免误删局部重新声明的 console 绑定
        if (object.scope.hasBinding('console')) {
          return;
        }

        const property = callee.get('property');
        let methodName = null;
        if (!callee.node.computed && property.isIdentifier()) {
          methodName = property.node.name;
        } else if (callee.node.computed && property.isStringLiteral()) {
          methodName = property.node.value;
        }

        const exclude = Array.isArray(state.opts?.exclude) ? state.opts.exclude : [];
        if (methodName && exclude.includes(methodName)) {
          return;
        }

        if (path.parentPath.isExpressionStatement()) {
          path.parentPath.remove();
        } else {
          path.replaceWith(t.unaryExpression('void', t.numericLiteral(0)));
        }
      },
    },
  };
};
