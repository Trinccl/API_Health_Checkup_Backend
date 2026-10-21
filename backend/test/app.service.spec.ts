import { AppService } from '../src/app.service';

describe('AppService', () => {
    it('getHello returns "Hello World!"', () => {
        expect(new AppService().getHello()).toBe('Hello World!');
    });
});
