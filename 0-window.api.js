
exports.forLib = function (LIB) {

    var exports = {};

    // TODO: Load adapters as needed on demand

    exports.adapters = {
        firewidgets: require("./for/firewidgets/0-window.api").forLib(LIB)
    }

    exports.forContexts = function (contexts) {

/*
        // TODO: Move this into 'cores/adapter/for/context'
        function forEachContextAdapter (adapterGroup, method, args, successHandler) {
            if (
                !contexts.adapters ||
                !contexts.adapters[adapterGroup]
            ) {
                return LIB.Promise.try(function () {
                    return successHandler.apply(null, args);
                });
            }
            var done = LIB.Promise.resolve();
            Object.keys(contexts.adapters[adapterGroup]).forEach(function (alias) {
                var methodName = method;
                if (!contexts.adapters[adapterGroup][alias][methodName]) return;
                done = done.then(function () {
                    return LIB.Promise.try(function () {
                        return contexts.adapters[adapterGroup][alias][methodName].apply(
                            contexts.adapters[adapterGroup][alias],
                            args
                        );
                    }).then(function (argsAfter) {
                        argsAfter.forEach(function (argAfter, i) {
                            args[i] = argAfter;
                        });
                    });
                });
            });
            return done.then(function () {
                return successHandler.apply(null, args);
            });
        }
*/
        var exports = {};

        var Context = exports.Context = function (defaults) {
            var self = this;

            var state = {
                componentInstanceFactories: {},
                componentScripts: {}
            };
            LIB._.merge(state, LIB._.cloneDeep(defaults));


            self.registerComponentInstanceFactory = function (alias, factory) {
                if (state.componentInstanceFactories[alias]) {
                    throw new Error("Component factory for alias '" + alias + "' already registered!");
                }
                state.componentInstanceFactories[alias] = factory;
            }

            self.getComponentInstanceFactory = function (alias) {
                return state.componentInstanceFactories[alias];
            }

            self.registerComponentScript = function (alias, scriptFunction) {
                // NOTE: Old scripts get over-written! Make sure they clean themselves up.
                state.componentScripts[alias] = scriptFunction;
            }

            self.resetComponentScripts = function () {
                state.componentScripts = {};
            }

            self.getComponentScript = function (alias) {
                return state.componentScripts[alias];
            }
        }
        Context.prototype = Object.create(LIB.EventEmitter.prototype);
        Context.prototype.contexts = contexts;

        return exports;
    }

    return exports;
}

