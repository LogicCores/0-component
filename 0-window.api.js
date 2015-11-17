
exports.forLib = function (LIB) {

    // TODO: Load and map this loading adapter dynamically.
    const FIREWIDGETS_COMPONENT_ASPECT = require("../../0.FireWidgets/Aspects/component/window.plugin.js").forLib(LIB);
    

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
                componentOverrideTemplateForActivePages: {},
                componentScripts: {},
                componentsForPages: {}
            };
            LIB._.merge(state, LIB._.cloneDeep(defaults));

            self.config = defaults;


            self.firewidgets = FIREWIDGETS_COMPONENT_ASPECT.forContext(self);


            self.registerComponentInstanceFactory = function (alias, factory) {
                if (state.componentInstanceFactories[alias]) {
                    throw new Error("Component factory for alias '" + alias + "' already registered!");
                }
                state.componentInstanceFactories[alias] = factory;
            }

            self.getComponentInstanceFactory = function (alias) {
                return state.componentInstanceFactories[alias];
            }

            self.registerComponentOverrideTemplateForActivePage = function (alias, impl) {
                // TODO: Keep track of components per page and don't override.
                state.componentOverrideTemplateForActivePages[alias] = impl;
            }
            self.getComponentOverrideTemplateForActivePage = function (alias) {
                return state.componentOverrideTemplateForActivePages[alias];
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


            var registerComponentForActivePage_waiting = [];
            self.registerComponentForActivePage = function (component) {
                if (!state.componentsForPages[contexts.page.getPath()]) {
                    state.componentsForPages[contexts.page.getPath()] = {};
                }
                state.componentsForPages[contexts.page.getPath()][component.id] = component;
                component.context.once("destroy", function () {
                    delete state.componentsForPages[contexts.page.getPath()];
                });
                if (registerComponentForActivePage_waiting[component.id]) {
                    registerComponentForActivePage_waiting[component.id].forEach(function (deferred) {
                        deferred.resolve(component);
                    });
                    registerComponentForActivePage_waiting[component.id] = [];
                }
            }
            self.getComponentForActivePage = function (id) {
                if (!state.componentsForPages[contexts.page.getPath()]) {
                    return null;
                }
                return state.componentsForPages[contexts.page.getPath()][id];
            }
            self.getComponentForActivePageAsync = function (id) {
                if (!state.componentsForPages[contexts.page.getPath()]) {
                    var deferred = LIB.Promise.defer();
                    if (!registerComponentForActivePage_waiting[id]) {
                        registerComponentForActivePage_waiting[id] = [];
                    }
                    registerComponentForActivePage_waiting[id].push(deferred);
                    return deferred.promise;
                }
                return LIB.Promise.resolve(state.componentsForPages[contexts.page.getPath()][id]);
            }

            self.getComponentIdsForPrefixForActivePage = function (prefix) {
                if (!state.componentsForPages[contexts.page.getPath()]) {
                    return null;
                }
                return Object.keys(state.componentsForPages[contexts.page.getPath()]).filter(function (id) {
                    return (id.substring(0, prefix.length) === prefix);
                });
            }

/*
            self.registerComponentForActivePage = function (component) {
                if (!state.componentsForPages[contexts.page.getPath()]) {
                    state.componentsForPages[contexts.page.getPath()] = {};
                }
                if (!state.componentsForPages[contexts.page.getPath()][component.id]) {
                    state.componentsForPages[contexts.page.getPath()][component.id] = LIB.Promise.defer();
                }
                state.componentsForPages[contexts.page.getPath()][component.id].resolve(component);
                component.once("destroy", function () {
                    delete state.componentsForPages[contexts.page.getPath()];
                });
            }
            self.getComponentForActivePage = function (id) {
                if (!state.componentsForPages[contexts.page.getPath()]) {
                    state.componentsForPages[contexts.page.getPath()] = {};
                }
                if (!state.componentsForPages[contexts.page.getPath()][id]) {
                    state.componentsForPages[contexts.page.getPath()][id] = LIB.Promise.defer();
                }
                return state.componentsForPages[contexts.page.getPath()][id].promise;
            }
*/

        }
        Context.prototype = Object.create(LIB.EventEmitter.prototype);
        Context.prototype.contexts = contexts;

        return exports;
    }

    return exports;
}

