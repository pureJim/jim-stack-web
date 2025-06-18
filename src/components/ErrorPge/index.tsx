import { Link, useRouteError } from 'react-router';

const ErrorComponent = () => {
  const error = useRouteError();
  console.error(error);
  return (
    <div>
      <h1>Error Occurred</h1>
      <p>{(error as any).data || 'Something went wrong!'}</p>
      <Link to="/">Go Back Home</Link>
    </div>
  );
};

export default ErrorComponent;
