import { Button, Divider } from 'antd';
import Editor from '../editor/components/LexicalEditor';

const HomePage = () => {
  return (
    <div>
      <Editor />
      <Divider />
      <Button type="primary">Button</Button>
    </div>
  );
};

export default HomePage;
