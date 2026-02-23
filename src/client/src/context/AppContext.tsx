import { createContext, useContext, useReducer, useEffect, type ReactNode } from 'react';
import type { QuestionDto, UsStateDto } from '../types/api';

interface AppState {
  readonly selectedStateId: number | null;
  readonly selectedState: UsStateDto | null;
  readonly questions: readonly QuestionDto[];
  readonly is6520Mode: boolean;
  readonly isOnline: boolean;
  readonly isLoading: boolean;
}

type AppAction =
  | { type: 'SET_STATE'; stateId: number; state: UsStateDto }
  | { type: 'SET_QUESTIONS'; questions: readonly QuestionDto[] }
  | { type: 'SET_6520_MODE'; enabled: boolean }
  | { type: 'SET_ONLINE'; online: boolean }
  | { type: 'SET_LOADING'; loading: boolean };

const initialState: AppState = {
  selectedStateId: getPersistedStateId(),
  selectedState: null,
  questions: [],
  is6520Mode: false,
  isOnline: navigator.onLine,
  isLoading: false,
};

function getPersistedStateId(): number | null {
  const stored = localStorage.getItem('selectedStateId');
  return stored ? Number(stored) : null;
}

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_STATE':
      localStorage.setItem('selectedStateId', String(action.stateId));
      return { ...state, selectedStateId: action.stateId, selectedState: action.state };
    case 'SET_QUESTIONS':
      return { ...state, questions: action.questions };
    case 'SET_6520_MODE':
      return { ...state, is6520Mode: action.enabled };
    case 'SET_ONLINE':
      return { ...state, isOnline: action.online };
    case 'SET_LOADING':
      return { ...state, isLoading: action.loading };
  }
}

interface AppContextValue {
  readonly state: AppState;
  readonly dispatch: React.Dispatch<AppAction>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { readonly children: ReactNode }): ReactNode {
  const [state, dispatch] = useReducer(appReducer, initialState);

  useEffect(() => {
    const handleOnline = (): void => dispatch({ type: 'SET_ONLINE', online: true });
    const handleOffline = (): void => dispatch({ type: 'SET_ONLINE', online: false });

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return context;
}
