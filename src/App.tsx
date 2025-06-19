import type { ThemeConfig } from 'antd';
import { ConfigProvider } from 'antd';
import { RouterProvider } from 'react-router';

import router from './routes';

const theme: ThemeConfig = {
  cssVar: true,
  components: {
    Button: {
      colorPrimary: '#39c5bb',
      colorPrimaryHover: '#39c5bcc7',
      colorPrimaryActive: '#39c5bcea',
      borderRadius: 8,
      fontFamily: 'var(--font)',
    },
  },
};

function App() {
  return (
    <div id="app">
      <ConfigProvider theme={theme}>
        <RouterProvider router={router} />
      </ConfigProvider>
    </div>
  );
}

export default App;
