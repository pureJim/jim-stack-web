import { redirect } from 'react-router';
import { isAuthenticated } from './auth';

const AuthLoader = async () => {
  if (isAuthenticated()) {
    return redirect('/login');
  }

  return null;
};

export default AuthLoader;
